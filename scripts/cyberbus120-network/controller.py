#!/usr/bin/env python3
"""Two independent SDK processes; private JSONL IPC, fail-closed public report."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import select
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

HERE = Path(__file__).resolve().parent
SAFE_CODES = frozenset('input io adapter deadline store query config auth_result unauthenticated '
    'private_root private_key secure_store already_started data_uninitialized unknown_operation '
    'uninitialized closed json png worker_protocol worker_exit worker_deadline worker_close '
    'ssh_driver driver_changed hosted_interaction remote_private_flow auth_failed discovery_deadline '
    'assertion controller_error network_result mapping_drain'.split())
SYNC_CODES = frozenset('sync_' + x for x in ['Io','InvalidInput','CorruptIdentity','Authentication',
    'Expired','Revoked','WorkspaceMismatch','Protocol','Limit','Timeout','Stopped','Backend','PlanStale','Busy','Transport'])
STORE_CODES=frozenset('database filesystem document invalid not_found locked conflict too_large unsupported '
    'sync_disabled sync_pending_flush sync_invalid sync_limit sync_equivocation sync_plan_stale '
    'sync_version_missing sync_blob_corrupt sync_missing_blob sync_attachment_conflict sync_media_publish '
    'sync_adoption_blocked sync_device_mismatch sync_schema_invalid sync_workspace_mismatch unclassified'.split())
STORE_PHASES=frozenset('harness.store_api harness.fixture.create_note harness.fixture.png harness.fixture.file '
    'harness.fixture.save_note harness.inspect.inventory harness.inspect.version backend.store_api '
    'backend.media.snapshot backend.media.verify backend.media.transaction backend.inventory backend.version '
    'backend.has_blob backend.publish_staged harness.recover.notes_before harness.recover.snapshot '
    'harness.recover.verify harness.recover.resolve harness.recover.notes_after harness.recover.read_attachment'.split())

def safe_code(value):
    if isinstance(value, str) and (value in SAFE_CODES or value in SYNC_CODES or
            value in {'store_'+code for code in STORE_CODES} or
            re.fullmatch(r'(sdk|config)_[0-9]{1,5}', value)):
        return value
    return 'controller_error'

class Failure(Exception):
    def __init__(self, code):
        self.code = safe_code(code)
        super().__init__(self.code)

class Report(dict):
    """Persist only the safe report, including stage changes during long network waits."""
    def __init__(self, path, **initial):
        super().__init__(initial)
        self.path=path
        self.persist()

    def persist(self):
        temporary=self.path.with_suffix(self.path.suffix+'.tmp')
        temporary.write_text(json.dumps(self,indent=2,sort_keys=True)+'\n')
        temporary.replace(self.path)

    def __setitem__(self, key, value):
        super().__setitem__(key,value)
        self.persist()

def check(value):
    if not value:
        raise Failure('assertion')

def safe_store_failure(value):
    if isinstance(value,dict) and value.get('code') in STORE_CODES and value.get('phase') in STORE_PHASES:
        return {'code':value['code'],'phase':value['phase']}
    return None

def sanitize_trajectory(rows):
    events={'network_start_submitted','network_start_result','sdk_network_event','sdk_devices_event',
            'sdk_auth_event','core_snapshot','directory_reset_fault','adapter_fault'}
    integers={'elapsed_ms','auth_phase','directory_revision','device_count','online_count',
              'error_code','revision','previous_revision','phase'}
    booleans={'directory_valid','running','reachable','result_ok'}
    def fields(source, allowed):
        if not isinstance(source,dict):
            return {}
        return {k:v for k,v in source.items() if k in allowed and
                ((k in integers and (v is None or type(v) is int and 0<=v<2**64)) or
                 (k in booleans and type(v) is bool))}
    output=[]
    for row in rows[-256:] if isinstance(rows,list) else []:
        if not isinstance(row,dict) or row.get('event') not in events:
            continue
        clean=fields(row,{'elapsed_ms','auth_phase','directory_revision','device_count','online_count','directory_valid'})
        clean['event']=row['event']
        clean['network']=fields(row.get('network'),{'running','reachable','error_code'})
        clean['detail']=fields(row.get('detail'),integers|booleans)
        output.append(clean)
    return output

def network_start(worker, report, label):
    report[label+'_network_start_submitted']=True
    try:
        result=worker.call('network_start')
        check(result=={'result_ok':True})
        report[label+'_network_start_result_ok']=True
    except Failure as e:
        report[label+'_network_start_result_ok']=False
        if e.code.startswith('sdk_'):
            report[label+'_network_start_error_code']=int(e.code.removeprefix('sdk_'))
        raise

class Worker:
    def __init__(self, binary, root, config, existing=False, registry=None):
        self.process = subprocess.Popen([str(binary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, bufsize=0)
        self.buffer = b''
        self.natural = False
        self.last_store_failure = None
        self.last_failed_operation = None
        if registry is not None:
            registry.append(self)
        self.initial = self.call('init', root=str(root), config=json.dumps(config), existing=existing)

    def call(self, op, budget=100, **kwargs):
        payload = json.dumps(dict(op=op, **kwargs), ensure_ascii=False).encode() + b'\n'
        try:
            self.process.stdin.write(payload)
            self.process.stdin.flush()
        except (BrokenPipeError, OSError):
            raise Failure('worker_exit') from None
        until = time.monotonic() + budget
        while b'\n' not in self.buffer:
            remaining = until - time.monotonic()
            if remaining <= 0 or not select.select([self.process.stdout], [], [], max(0, remaining))[0]:
                raise Failure('worker_deadline')
            chunk = os.read(self.process.stdout.fileno(), 65536)
            if not chunk:
                raise Failure('worker_exit')
            self.buffer += chunk
            if len(self.buffer) > 32 * 1024 * 1024:
                raise Failure('worker_protocol')
        line, self.buffer = self.buffer.split(b'\n', 1)
        try:
            result = json.loads(line)
        except (ValueError, UnicodeError):
            raise Failure('worker_protocol') from None
        if not isinstance(result, dict) or type(result.get('ok')) is not bool:
            raise Failure('worker_protocol')
        if not result['ok']:
            self.last_store_failure=safe_store_failure(result.get('store_failure'))
            allowed_operations={'init','state','auth_start','auth_callback','restore','data_start','network_start',
                'network_stop','bind','map','drain_maps','invitation','pair','transfer','pause','fixture','inspect',
                'apply','conflicts','recover_conflict','close'}
            self.last_failed_operation=op if op in allowed_operations else 'unknown_operation'
            raise Failure(result.get('code'))
        return result['data']

    def close(self):
        if self.process.poll() is not None:
            self.close_pipes()
            return self.natural
        try:
            check(self.call('close', budget=40) is True)
            self.process.stdin.close()
            self.natural = self.process.wait(timeout=15) == 0
        except BaseException:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=10)
        self.close_pipes()
        return self.natural

    def close_pipes(self):
        for pipe in [self.process.stdin,self.process.stdout]:
            if pipe is not None:
                pipe.close()

def ssh_callback(host, config, authorization, driver_sha):
    # Command contains only source code; authorization is delivered on SSH stdin.
    source = (HERE / 'remote_login.py').read_text()
    import shlex
    command = 'python3 -c ' + shlex.quote(source)
    try:
        p = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, command],
            input=json.dumps(dict(config=config, authorization=authorization, driver_sha256=driver_sha)).encode(),
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=170)
        if p.returncode != 0:
            raise Failure('remote_private_flow')
        result = json.loads(p.stdout)
        if not result['ok']:
            raise Failure(result.get('code'))
        return result['callback']
    except (OSError, ValueError, subprocess.TimeoutExpired, KeyError):
        raise Failure('remote_private_flow') from None

def driver_digest(host):
    # Read source only. Operator must audit this exact driver before running real auth.
    command = 'sha256sum /home/water/work/codex-work/cyberbus/linux-env-002/source/deploy/drive-hosted-login.py'
    try:
        p = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, command],
                           stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20)
        value = p.stdout.decode().split()[0]
        if p.returncode or not re.fullmatch('[0-9a-f]{64}', value):
            raise Failure('ssh_driver')
        return value
    except (OSError, UnicodeError, IndexError, subprocess.TimeoutExpired):
        raise Failure('ssh_driver') from None

def login(worker, args, config, digest, report, label):
    auth = worker.call('auth_start')
    report[label + '_authorization_started'] = True
    callback = ssh_callback(args.ssh_host, config, auth['authorization'], digest)
    worker.call('auth_callback', callback=callback)
    s = wait(worker, lambda s: s['authenticated'], seconds=30, failure='auth_failed')
    report[label + '_authenticated'] = s['authenticated']
    return s

def wait(worker, predicate, seconds=60, failure='discovery_deadline'):
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        state = worker.call('state', budget=15)
        if predicate(state):
            return state
        if state['phase'] in (6, 7, 9):
            raise Failure('auth_failed')
        time.sleep(0.25)
    raise Failure(failure)

def discover(a, b, aid, bid, seconds):
    aa=wait(a, lambda s:any(p['id']==bid and p['profile'] for p in s['peers']), seconds)
    bb=wait(b, lambda s:any(p['id']==aid and p['profile'] for p in s['peers']), seconds)
    pa=next(p for p in aa['peers'] if p['id']==bid)
    pb=next(p for p in bb['peers'] if p['id']==aid)
    a.call('bind', peer=bid, **pa['profile'])
    b.call('bind', peer=aid, **pb['profile'])
    return aa, bb

def transfer(a, b, bid, peer, direction):
    a.call('map', peer=bid)
    try:
        result=a.call('transfer', budget=180, peer=peer, direction=direction)
    except Failure:
        # Preserve the first business failure; cleanup still executes and final close joins.
        try:
            a.call('drain_maps')
        except Failure:
            pass
        raise
    else:
        a.call('drain_maps')
        return result

def inspect(worker, fixture):
    return worker.call('inspect', **fixture)

def normalized_projection(state):
    note=copy.deepcopy(state['note'])
    check(note is not None and all(a is not None for a in state['attachments']))
    ids=[]
    def visit(node):
        if node.get('type')=='attachment':
            ids.append(node['attrs']['id'])
            node['attrs']['id']='attachment-'+str(len(ids))
        for child in node.get('content',[]):
            visit(child)
    visit(note['document'])
    check(len(ids)==len(state['attachments']))
    return dict(note,attachments=state['attachments'])

def same(source, target, fixture):
    a, b = inspect(source, fixture), inspect(target, fixture)
    check(a['note'] is not None and a['note'] == b['note'])
    check(all(x is not None for x in a['attachments']))
    # Compare full MIME/data URL response and metadata-bearing production wire payload.
    check(a['attachments'] == b['attachments'])
    check(all(a['blobs_present']) and a['blobs_present']==b['blobs_present'])
    check(sorted(a['versions'], key=lambda x:x['digest']) == sorted(b['versions'], key=lambda x:x['digest']))

def absent(worker, fixture):
    state = inspect(worker, fixture)
    check(state['note'] is None and state['counts'] == [0, 0, 0])
    check(all(a is None for a in state['attachments']))
    # A common PNG may already exist, but the text-seeded binary is unique.
    check(state['blobs_present'][1] is False)

def staged(worker, fixture):
    state = inspect(worker, fixture)
    check(state['note'] is None and state['counts'][2] > 0 and state['pending'] > 0)

def preflight(report):
    try:
        with socket.create_connection(('43.155.169.102', 11010), timeout=8):
            report['relay_tcp_reachable'] = True
    except OSError:
        report['relay_tcp_reachable'] = False
    try:
        with urllib.request.urlopen('https://auth.x.aixgg.com/oidc/.well-known/openid-configuration', timeout=12) as r:
            report['oidc_discovery_http_code'] = r.status
            d=json.load(r)
            report['oidc_issuer_matches'] = d.get('issuer')=='https://auth.x.aixgg.com/oidc'
    except BaseException:
        report['oidc_issuer_matches'] = False

def run(args, report):
    config=json.loads((HERE / 'public-config.json').read_text())
    workers=[]
    private=Path(tempfile.mkdtemp(prefix='cyberbus124-', dir=args.private_parent))
    os.chmod(private,0o700)
    report['stage']='independent_installations'
    try:
        roots=[private / x for x in ['a','b']]
        for root in roots:
            root.mkdir(mode=0o700)
        a=Worker(args.binary,roots[0],config,registry=workers)
        b=Worker(args.binary,roots[1],config,registry=workers)
        binary_hash=a.initial.get('build_source_sha256')
        check(binary_hash==b.initial.get('build_source_sha256') and isinstance(binary_hash,str)
              and re.fullmatch('[0-9a-f]{64}',binary_hash))
        report['compiled_source_sha256']=binary_hash
        for key,length in [('core_revision',40),('core_source_sha256',64),('compiled_local_closure_sha256',64)]:
            value=a.initial.get(key)
            check(value==b.initial.get(key) and isinstance(value,str) and re.fullmatch('[0-9a-f]{'+str(length)+'}',value))
            report[key]=value
        aid,bid=a.initial['local'],b.initial['local']
        check(a.process.pid!=b.process.pid and aid!=bid and len(aid)==len(bid)==32)
        report['two_processes_independent_identity']=True
        if args.mode=='lifecycle':
            report['stage']='lifecycle_complete'
            return
        preflight(report)
        digest=driver_digest(args.ssh_host)
        # Pins the source inspected in this task; changes require a fresh source audit.
        check(digest == args.driver_sha256)
        report['driver_audited']=True
        report['stage']='auth_a'
        sa=login(a,args,config,digest,report,'a')
        da=a.call('data_start',label='CyberBus harness A')
        network_start(a,report,'a')
        report['stage']='auth_b'
        sb=login(b,args,config,digest,report,'b')
        db=b.call('data_start',label='CyberBus harness B')
        network_start(b,report,'b')
        check(sa['account']==sb['account'] and da['workspace']==db['workspace'])
        check(da['device']!=db['device'] and da['key']!=db['key'])
        report['verified_account_workspace_equal']=True
        report['independent_store_noise_identity']=True
        report['stage']='discovery'
        aa,bb=discover(a,b,aid,bid,args.discovery_seconds)
        report['a_network_running']=aa['network']['running']
        report['b_network_running']=bb['network']['running']
        report['mutual_authenticated_profile_discovery']=True
        report['stage']='sdk_map_noise_pair'
        endpoint=a.call('map',peer=bid)['endpoint']
        invite=b.call('invitation',endpoint=endpoint)['invitation']
        peer=a.call('pair',invitation=invite)['peer']
        a.call('drain_maps')
        report['sdk_data_noise_pair']=True
        report['stage']='push'
        report['api_phase']='fixture_a'
        an=a.call('fixture',text='A 推送的完整笔记')
        report['api_phase']='fixture_b'
        bn=b.call('fixture',text='B 独有完整笔记')
        report['api_phase']='inspect_reverse_before_push'
        absent(a,bn);absent(b,an)
        report['api_phase']='production_transfer_push'
        transfer(a,b,bid,peer,'push')
        report['api_phase']='inspect_push_durable_and_reverse'
        staged(b,an);absent(a,bn)
        report['api_phase']='production_apply_push'
        b.call('apply');same(a,b,an)
        report['push_richtext_png_file_bytes_reverse_excluded']=True
        report['stage']='pull'
        report['api_phase']='fixture_pull_exclusion'
        late=a.call('fixture',text='A 不允许随 pull 上传')
        report['api_phase']='production_transfer_pull'
        transfer(a,b,bid,peer,'pull')
        report['api_phase']='inspect_pull_durable_and_reverse'
        staged(a,bn);absent(b,late)
        report['api_phase']='production_apply_pull'
        a.call('apply');same(b,a,bn)
        report['pull_richtext_png_file_bytes_reverse_excluded']=True
        report['stage']='both'
        report['api_phase']='production_transfer_both'
        transfer(a,b,bid,peer,'both');a.call('apply');b.call('apply');same(a,b,late)
        report['both_converged']=True
        report['stage']='offline_restart'
        report['api_phase']='offline_edit_and_dirty_restart'
        a.call('network_stop');b.call('network_stop')
        offline=b.call('fixture',text='B 离线后待捕获重启版本')
        check(inspect(b,offline)['dirty'])
        check(b.close())
        b=Worker(args.binary,roots[1],config,existing=True,registry=workers)
        check(b.initial['local']==bid)
        b.call('restore')
        wait(b,lambda s:s['authenticated'],30,'auth_failed')
        db2=b.call('data_start',label='CyberBus harness B restarted')
        check(db2==db and inspect(b,offline)['dirty'])
        network_start(a,report,'a');network_start(b,report,'b');discover(a,b,aid,bid,args.discovery_seconds)
        transfer(a,b,bid,peer,'pull');staged(a,offline)
        check(a.close())
        a=Worker(args.binary,roots[0],config,existing=True,registry=workers)
        check(a.initial['local']==aid)
        a.call('restore');wait(a,lambda s:s['authenticated'],30,'auth_failed')
        check(a.call('data_start',label='CyberBus harness A restarted')==da)
        staged(a,offline);a.call('apply');same(b,a,offline)
        network_start(a,report,'a');discover(a,b,aid,bid,args.discovery_seconds)
        report['encrypted_test_key_restart_identity_dirty_and_bytes']=True
        report['durable_inbox_survived_process_restart']=True
        report['stage']='concurrent_conflict'
        report['api_phase']='offline_concurrent_edit_then_transfer_both'
        a.call('network_stop');b.call('network_stop')
        ca=a.call('fixture',note=an['note'],text='A 并发分支及附件')
        cb=b.call('fixture',note=an['note'],text='B 并发分支及附件')
        expected=[normalized_projection(inspect(a,ca)),normalized_projection(inspect(b,cb))]
        network_start(a,report,'a');network_start(b,report,'b');discover(a,b,aid,bid,args.discovery_seconds)
        transfer(a,b,bid,peer,'both');a.call('apply');b.call('apply')
        av,bv=a.call('conflicts'),b.call('conflicts')
        va=sorted([v for v in av if v['entityId']==an['note']],key=lambda v:v['digest'])
        vb=sorted([v for v in bv if v['entityId']==an['note']],key=lambda v:v['digest'])
        report['api_phase']='conflict_full_wire_branches'
        check(len(va)==2 and va==vb)
        report['api_phase']='conflict_branch_blob_validation'
        for fixture in [ca,cb]:
            check(all(inspect(a,fixture)['blobs_present']) and all(inspect(b,fixture)['blobs_present']))
        report['api_phase']='production_keep_all_recovery_and_original_bytes'
        for worker in [a,b]:
            recovered=worker.call('recover_conflict',note=an['note'],digest=va[0]['digest'])
            check(recovered['remaining_conflicts']==0 and len(recovered['notes'])==2)
            check(sorted(recovered['notes'],key=lambda n:n['plain'])==sorted(expected,key=lambda n:n['plain']))
        report['conflict_two_full_branches_and_attachment_bytes']=True
        report['production_keep_all_recovered_full_documents_and_original_bytes']=True
        report['stage']='pause_error'
        report['api_phase']='production_paused_transfer'
        a.call('pause',paused=True)
        try:
            transfer(a,b,bid,peer,'both')
        except Failure as e:
            check(e.code=='sync_Revoked')
            a.last_failed_operation=None
            a.last_store_failure=None
        else:
            raise Failure('assertion')
        report['paused_explicit_transfer_rejected']=True
        report['stage']='complete'
        report['api_phase']='complete'
    finally:
        for label, worker in [('a',locals().get('a')),('b',locals().get('b'))]:
            if worker is not None and worker.process.poll() is None:
                try:
                    s=worker.call('state',budget=2)
                    report[label+'_final_auth_phase']=s['phase']
                    report[label+'_final_directory_valid']=s['directory_valid']
                    report[label+'_final_online_peers']=len(s['peers'])
                    report[label+'_state_trajectory']=sanitize_trajectory(s.get('trajectory'))
                    report[label+'_trajectory_samples']=len(report[label+'_state_trajectory'])
                    for key,value in s.get('event_counts',{}).items():
                        if isinstance(value,(int,bool)):
                            report[label+'_events_'+key]=value
                    if s['auth_code'] is not None:
                        report[label+'_final_auth_code']=s['auth_code']
                    if s['network']:
                        for key in ['running','reachable','code']:
                            if s['network'][key] is not None:
                                report[label+'_final_network_'+key]=s['network'][key]
                except Failure:
                    pass
                failure=worker.last_store_failure
                if failure:
                    report[label+'_store_error_code']=failure['code']
                    report[label+'_store_error_api_phase']=failure['phase']
                if worker.last_failed_operation:
                    report[label+'_failed_operation']=worker.last_failed_operation
        report['all_workers_natural_close']=all([w.close() for w in workers])
        # Private installation vaults/keys survive for explicit investigation or restore.
        # Only the public report is printed; directory path is written to caller-owned fd.
        if args.private_path_fd is not None:
            os.write(args.private_path_fd,(str(private)+'\n').encode())

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--binary',type=Path,required=True)
    p.add_argument('--mode',choices=['lifecycle','real'],default='lifecycle')
    p.add_argument('--ssh-host',default='cath-w')
    p.add_argument('--driver-sha256')
    p.add_argument('--discovery-seconds',type=int,default=90)
    p.add_argument('--private-parent',type=Path)
    p.add_argument('--private-path-fd',type=int)
    p.add_argument('--report',type=Path,default=HERE / 'latest-report.json')
    args=p.parse_args()
    if args.mode=='real' and not re.fullmatch('[0-9a-f]{64}',args.driver_sha256 or ''):
        p.error('real mode requires the SHA256 of the audited callback-only driver')
    report=Report(args.report,schema=1,passed=False,real_network_suite=args.mode=='real',
            tauri_account_session_verified=False,production_platform_key_store_verified=False,
            test_key_encrypted_store=True)
    report['binary_sha256']=hashlib.sha256(args.binary.read_bytes()).hexdigest()
    try:
        run(args,report)
        report['binary_unchanged']=hashlib.sha256(args.binary.read_bytes()).hexdigest()==report['binary_sha256']
        report['passed']=report['all_workers_natural_close'] and report['binary_unchanged']
    except Failure as e:
        report['failure_code']=e.code
    except BaseException:
        report['failure_code']='controller_error'
    report['harness_source_sha256']=hashlib.sha256((HERE/'node.rs').read_bytes()).hexdigest()
    # Public report is constructed here; no child response, exception text or auth artifact.
    output=json.dumps(report,indent=2,sort_keys=True)+'\n'
    args.report.write_text(output)
    # Full bounded trajectory stays in the safe evidence file, not a long terminal dump.
    summary={k:v for k,v in report.items() if not k.endswith('_state_trajectory')}
    sys.stdout.write(json.dumps(summary,indent=2,sort_keys=True)+'\n')
    return 0 if report['passed'] else 1

if __name__=='__main__':
    raise SystemExit(main())
