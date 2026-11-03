from pathlib import Path
import subprocess,sys,json,datetime,xml.etree.ElementTree as ET
adb='/Users/water/Library/Android/sdk/platform-tools/adb';p=[adb,'-s','emulator-5580'];out=Path('/Users/water/work/2026/Apple-Notes-Clone/docs/verification/qa-android-ime/run-20c3014')
run=lambda *a:subprocess.check_output(p+list(a))
op,*args=sys.argv[1:];trace={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'op':op,'args':args}
if op=='snapshot':
 name=args[0];run('shell','uiautomator','dump','/data/local/tmp/qa-ime-window.xml');xml=run('exec-out','cat','/data/local/tmp/qa-ime-window.xml');(out/(name+'.xml')).write_bytes(xml);(out/(name+'.png')).write_bytes(run('exec-out','screencap','-p'))
 root=ET.fromstring(xml);rows=[{k:n.attrib.get(k) for k in ['text','content-desc','resource-id','class','clickable','bounds']} for n in root.iter('node') if n.attrib.get('text') or n.attrib.get('content-desc')];print(json.dumps(rows,ensure_ascii=False,indent=2))
elif op=='tap':run('shell','input','tap',*args)
elif op=='key':run('shell','input','keyevent',*args)
elif op=='taps':
 for xy in args:
  x,y=xy.split(',');run('shell','input','tap',x,y)
else:raise Exception('Unknown operation')
with (out/'native-actions.jsonl').open('a') as f:f.write(json.dumps(trace,ensure_ascii=False)+'\n')
