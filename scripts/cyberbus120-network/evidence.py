#!/usr/bin/env python3
"""Freeze/verify public source-closure and binary evidence; never inspect test vaults."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[1]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def git(*args):
    return subprocess.check_output(['git','-C',str(REPO),*args],text=True).strip()

def aggregate(entries):
    h=hashlib.sha256()
    for entry in sorted(entries,key=lambda e:e['path']):
        h.update(entry['path'].encode()+b'\0'+entry['sha256'].encode()+b'\n')
    return h.hexdigest()

def sources():
    selected=set()
    for name in ['node.rs','backend.rs','Cargo.toml','Cargo.lock','build.py','controller.py',
                 'remote_login.py','evidence.py','test_controller.py','public-config.json']:
        selected.add(HERE/name)
    for name in ['store.rs','session.rs','sync/identity.rs','sync/model.rs','sync/network.rs']:
        selected.add(REPO/'src-tauri/src'/name)
    for name in ['store','session','sync/network','application','agent_access']:
        selected.update((REPO/'src-tauri/src'/name).rglob('*.rs'))
    selected.add(REPO/'src-tauri/src/store/archive/document-schema.json')
    for name in ['crates/notes-cyberbus','vendor/cyberbus/crates/cyberbus']:
        directory=REPO/name
        for pattern in ['src/**/*.rs','Cargo.toml','Cargo.lock','build.rs']:
            selected.update(directory.glob(pattern))
    return sorted(p for p in selected if p.is_file())

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary',type=Path,required=True)
    parser.add_argument('--report',type=Path,required=True)
    parser.add_argument('--manifest',type=Path,required=True)
    parser.add_argument('--verify',action='store_true')
    args=parser.parse_args()
    if args.verify:
        manifest=json.loads(args.manifest.read_text())
        entries=manifest['source_files']
        sources_match=all((REPO/e['path']).is_file() and sha(REPO/e['path'])==e['sha256'] for e in entries)
        result={'source_closure_matches':sources_match,
            'source_aggregate_matches':aggregate(entries)==manifest['source_closure_sha256'],
            'binary_matches':sha(args.binary)==manifest['binary_sha256'],
            'report_matches':sha(args.report)==manifest['report_sha256']}
        print(json.dumps(result,sort_keys=True))
        return 0 if all(result.values()) else 1
    report=json.loads(args.report.read_text())
    binary_sha=sha(args.binary)
    if report['binary_sha256']!=binary_sha:
        raise SystemExit('binary_digest_mismatch')
    entries=[{'path':str(p.relative_to(REPO)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sources()]
    if report.get('compiled_local_closure_sha256')!=aggregate(entries):
        raise SystemExit('compiled_local_source_closure_mismatch')
    crate=[e for e in entries if Path(e['path']).name in ['node.rs','backend.rs','Cargo.toml','Cargo.lock']
           and Path(e['path']).parent==HERE.relative_to(REPO)]
    runtime=[e for e in entries if e['path'].startswith('scripts/cyberbus120-network/')]
    source_paths=[e['path'] for e in entries]
    clean=subprocess.run(['git','-C',str(REPO),'diff','--quiet','HEAD','--',*source_paths]).returncode==0
    untracked=git('ls-files','--others','--exclude-standard','--',*source_paths)
    command=['python3','scripts/cyberbus120-network/controller.py','--binary',str(args.binary),
        '--mode','real','--driver-sha256','0eec7c477991cd3e81518d937429af24ff80ca3c45878276c27362ef227a23e3',
        '--report',str(args.report)]
    manifest={'schema':1,'source_checkout_head':git('rev-parse','HEAD'),
        'core_build_baseline':report['core_revision'],
        'core_source_sha256_at_build':report['core_source_sha256'],
        'production_account_sync_baseline':git('log','-1','--format=%H','--','src-tauri/src/account','src-tauri/src/sync','src-tauri/src/store.rs','src-tauri/src/store'),
        'source_files_committed_unchanged':clean and not untracked,
        'sdk_revision':'359465e83bd74b571a963f3d1fdc238f50169919',
        'dependency_lock':'scripts/cyberbus120-network/Cargo.lock',
        'dependency_note':'Registry checksums and all external Git commits are pinned by Cargo.lock; local core and patched SDK runtime are in source_files.',
        'aggregate_algorithm':'SHA256 of sorted UTF-8 relative path + NUL + ASCII file SHA256 + LF',
        'harness_crate_source_sha256':aggregate(crate),
        'harness_runtime_sources_sha256':aggregate(runtime),
        'source_closure_sha256':aggregate(entries),'source_files':entries,
        'source_scope':'Conservative source superset includes compiled modules and their local tests; no private config, vault, key, identity or fixture account file.',
        'binary_path':str(args.binary),'binary_sha256':binary_sha,
        'node_rs_sha256_embedded':report['compiled_source_sha256'],
        'local_source_closure_sha256_embedded':report['compiled_local_closure_sha256'],
        'report_path':str(args.report),'report_sha256':sha(args.report),
        'build_command':['python3','scripts/cyberbus120-network/build.py','--target-dir',str(args.binary.parent.parent)],
        'run_command':command,
        'run_command_note':'Executed from repository root with the shown public arguments; SSH authorization/callback never appears in argv.',
        'toolchain':{'rustc':subprocess.check_output(['rustc','--version'],text=True).strip(),
                     'cargo':subprocess.check_output(['cargo','--version'],text=True).strip()}}
    args.manifest.write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'source_files':len(entries),'source_closure_sha256':manifest['source_closure_sha256'],
        'harness_crate_source_sha256':manifest['harness_crate_source_sha256'],'binary_sha256':binary_sha,
        'source_files_committed_unchanged':manifest['source_files_committed_unchanged']},sort_keys=True))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
