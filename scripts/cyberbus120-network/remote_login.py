"""Executed on cath-w via SSH stdin. stdout MUST remain a private return pipe.

Only invokes audited callback-only driver, never verify-logto.main/Admin/exchange.
No loopback delivery: its legacy 18765 restriction does not match this deployment.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

DRIVER = Path('/home/water/work/codex-work/cyberbus/linux-env-002/source/deploy/drive-hosted-login.py')
FIXTURE = Path('/home/water/work/codex-work/logto/.cybernote-product-20261118T113336Z/qa-primary/test-account.json')

def main():
    request = json.load(sys.stdin)
    if hashlib.sha256(DRIVER.read_bytes()).hexdigest() != request['driver_sha256']:
        return {'ok': False, 'code': 'driver_changed'}
    private = Path(tempfile.mkdtemp(prefix='cyberbus124-'))
    try:
        os.chmod(private, 0o700)
        for name, value in [('public-config.json', json.dumps(request['config'])),
                            ('authorization.txt', request['authorization'])]:
            fd = os.open(private / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w') as f:
                f.write(value)
        shutil.copyfile(FIXTURE, private / 'test-account.json')
        os.chmod(private / 'test-account.json', 0o600)
        callback = private / 'callback.txt'
        result = subprocess.run(['python3', str(DRIVER), '--private-dir', str(private),
                                 '--authorization-file', str(private / 'authorization.txt'),
                                 '--callback-file', str(callback)],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=150)
        if result.returncode != 0 or not callback.is_file():
            return {'ok': False, 'code': 'hosted_interaction'}
        return {'ok': True, 'callback': callback.read_text().strip()}
    finally:
        shutil.rmtree(private)

if __name__ == '__main__':
    try:
        response = main()
    except BaseException:
        response = {'ok': False, 'code': 'remote_private_flow'}
    print(json.dumps(response))
