"""Confidential IPC/report contracts; no authentication fixture or provider mocks."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import controller as c

class Contracts(unittest.TestCase):
    def worker(self, source):
        root=Path(self.temp.name)
        binary=root/'worker'
        binary.write_text('#!/usr/bin/env python3\n'+source)
        binary.chmod(0o700)
        return c.Worker(binary,root,{})

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp.cleanup()

    def test_unknown_error_text_cannot_become_report_code(self):
        for secret in ['https://private/callback?code=SECRET','username=PRIVATE',
                       'sync_Revoked password=PRIVATE',{'token':'PRIVATE'},123,None]:
            self.assertEqual(c.safe_code(secret),'controller_error')
        for code in ['sdk_16','sync_Revoked','hosted_interaction']:
            self.assertEqual(c.safe_code(code),code)

    def test_child_error_payload_is_filtered(self):
        w=self.worker('''import json,sys
for line in sys.stdin:
    op=json.loads(line)['op']
    print(json.dumps({'ok':True,'data':{}}) if op=='init' else json.dumps({'ok':False,'code':'PRIVATE_TOKEN_AND_CALLBACK'}),flush=True)
''')
        try:
            with self.assertRaises(c.Failure) as caught:
                w.call('state')
            self.assertEqual(str(caught.exception),'controller_error')
        finally:
            w.close()

    def test_missing_newline_has_absolute_deadline(self):
        w=self.worker('''import json,sys,time
for line in sys.stdin:
    if json.loads(line)['op']=='init':print('{"ok":true,"data":{}}',flush=True)
    else:
        print('PRIVATE_PARTIAL',end='',flush=True)
        time.sleep(10)
''')
        try:
            with self.assertRaises(c.Failure) as caught:
                w.call('state',budget=0.05)
            self.assertEqual(caught.exception.code,'worker_deadline')
        finally:
            w.process.terminate();w.process.wait(timeout=3);w.close()

    def test_natural_close_requires_response_and_exit_zero(self):
        w=self.worker('''import json,sys
for line in sys.stdin:
    op=json.loads(line)['op']
    print(json.dumps({'ok':True,'data':True if op=='close' else {}}),flush=True)
    if op=='close':break
''')
        self.assertTrue(w.close())
        self.assertEqual(w.process.returncode,0)

    def test_authorization_goes_to_ssh_stdin_only(self):
        seen={}
        def run(argv,**kwargs):
            seen.update(argv=argv,kwargs=kwargs)
            return subprocess.CompletedProcess(argv,0,b'{"ok":true,"callback":"PRIVATE_CALLBACK"}')
        with patch.object(c.subprocess,'run',side_effect=run):
            result=c.ssh_callback('cath-w',{'client_id':'public'},'PRIVATE_AUTHORIZATION','0'*64)
        self.assertEqual(result,'PRIVATE_CALLBACK')
        self.assertNotIn('PRIVATE_AUTHORIZATION',' '.join(seen['argv']))
        self.assertEqual(json.loads(seen['kwargs']['input'])['authorization'],'PRIVATE_AUTHORIZATION')
        self.assertEqual(seen['kwargs']['stderr'],subprocess.DEVNULL)

    def test_reverse_absence_requires_inbox_and_unique_blob_absence(self):
        fixture={'note':'test','attachments':[],'blob_refs':[]}
        good={'note':None,'counts':[0,0,0],'attachments':[None,None],'blobs_present':[True,False]}
        with patch.object(c,'inspect',return_value=good):
            c.absent(None,fixture)
        for key,value in [('counts',[0,0,1]),('blobs_present',[True,True])]:
            with patch.object(c,'inspect',return_value=dict(good,**{key:value})):
                with self.assertRaises(c.Failure):c.absent(None,fixture)

    def test_trajectory_keeps_only_finite_safe_fields(self):
        source=[{'event':'sdk_network_event','elapsed_ms':3,'auth_phase':4,
            'directory_valid':False,'directory_revision':7,'device_count':2,'online_count':1,
            'network':{'running':False,'reachable':False,'error_code':None,'message':'PRIVATE'},
            'detail':{'running':True,'reachable':True,'error_code':16,'claims':'PRIVATE'},
            'account':'PRIVATE','uri':'PRIVATE'}, {'event':'PRIVATE_CALLBACK'}]
        cleaned=c.sanitize_trajectory(source)
        self.assertEqual(len(cleaned),1)
        self.assertNotIn('PRIVATE',json.dumps(cleaned))
        self.assertEqual(cleaned[0]['detail']['error_code'],16)

    def test_network_start_sdk_error_is_preserved(self):
        class Failed:
            def call(self,*args,**kwargs):raise c.Failure('sdk_16')
        report={}
        with self.assertRaises(c.Failure):c.network_start(Failed(),report,'a')
        self.assertEqual(report,{'a_network_start_submitted':True,
            'a_network_start_result_ok':False,'a_network_start_error_code':16})

    def test_store_error_code_and_api_phase_are_closed_whitelists(self):
        self.assertEqual(c.safe_code('store_sync_pending_flush'),'store_sync_pending_flush')
        source={'code':'sync_pending_flush','phase':'harness.inspect.inventory','message':'PRIVATE'}
        self.assertEqual(c.safe_store_failure(source),{'code':'sync_pending_flush','phase':'harness.inspect.inventory'})
        for changed in [dict(source,code='PRIVATE'),dict(source,phase='PRIVATE_PATH')]:
            self.assertIsNone(c.safe_store_failure(changed))

if __name__=='__main__':
    unittest.main()
