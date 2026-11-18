#!/usr/bin/env python3
"""Export exact reviewed commit, append isolated tests, never edit product sources."""
import argparse, io, os, pathlib, subprocess, tarfile, tempfile
parser=argparse.ArgumentParser()
parser.add_argument('--target-dir',required=True)
parser.add_argument('--protoc',required=True)
parser.add_argument('--revision',default='127a08e200396cf1de1a1a5186440b5c27ffbe9c')
parser.add_argument('--baseline',action='store_true')
parser.add_argument('--check',action='store_true')
args=parser.parse_args()
fixture=pathlib.Path(__file__).resolve().parent
root=subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip()
revision=args.revision
snapshot=pathlib.Path(tempfile.mkdtemp(prefix='cyberbus120-review-fixture-'))
archive=subprocess.check_output(['git','-C',root,'archive',revision,'crates/notes-cyberbus','vendor/cyberbus'])
with tarfile.open(fileobj=io.BytesIO(archive)) as source: source.extractall(snapshot)
for module in ([] if args.baseline or args.check else ['bridge','bus','store']):
    file=snapshot/'crates/notes-cyberbus/src'/(module+'.rs')
    text=file.read_text(); at=text.rfind('}')
    # Append within the author's cfg(test) module, preserving all production code bytes.
    file.write_text(text[:at]+'\ninclude!('+repr(str(fixture/(module+'.rs'))).replace("'",'"')+');\n'+text[at:])
env=dict(os.environ,PROTOC=str(pathlib.Path(args.protoc).resolve()),CARGO_TARGET_DIR=str(pathlib.Path(args.target_dir).resolve()))
command=['cargo','check' if args.check else 'test','--locked','--offline','--manifest-path','crates/notes-cyberbus/Cargo.toml']
if not args.check and not args.baseline: command += ['review_','--','--nocapture']
print('reviewed commit:',revision,'isolated snapshot:',snapshot,flush=True)
try:
    result=subprocess.run(command,cwd=snapshot,env=env,timeout=240)
except subprocess.TimeoutExpired:
    print('bounded review run exceeded 240 seconds; result INCOMPLETE',flush=True)
    raise SystemExit(124)
print('reviewed commit:',revision,'isolated snapshot:',snapshot,flush=True)
raise SystemExit(result.returncode)
