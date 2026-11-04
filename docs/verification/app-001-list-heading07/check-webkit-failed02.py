from pathlib import Path
import hashlib,json,subprocess
r=Path.cwd();o=Path(__file__).resolve().parent;out=o/'webkit02';out.mkdir(exist_ok=False)
def dump(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
argv=['xcrun','clang','-fobjc-arc','-fblocks','-mmacosx-version-min=12.0','-Wall','-Wextra','-Werror','-framework','AppKit','-framework','WebKit',str(o/'webkit-render.m'),'-o',str(out/'render')]
p=subprocess.run(argv,text=True,capture_output=True,timeout=60);dump(out/'compile.json',dict(argv=argv,exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr));assert p.returncode==0
dom='''<div id="root"><div class="app desktop native-toolbar" style="--sidebar-width:228px;--list-width:280px;--native-top:52px"><aside class="sidebar"></aside><section class="notes-pane"><div class="notes-scroll"><div class="note-entry"><div class="date-section" id="first">今天</div><div class="note-row-wrap"><button class="note-row" id="row">排版核对</button></div></div><div class="note-entry"><div class="date-section" id="later">昨天</div><div class="note-row-wrap"><button class="note-row">后续分组</button></div></div><div class="search-zero-section">备忘录</div></div></section><main class="editor-pane"></main></div></div>'''
result={}
for label,css in [('baseline',o/'baseline-style.css'),('candidate',r/'src/style.css')]:
 html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css.read_text()+'</style>'+dom+'</html>'
 path=out/(label+'.html');path.write_text(html)
 argv=[str(out/'render'),str(path),str(out/label),str(o/'webkit-metrics.js')]
 p=subprocess.run(argv,text=True,capture_output=True,timeout=60);dump(out/(label+'-run.json'),dict(argv=argv,exitCode=p.returncode,stdout=p.stdout,stderr=p.stderr))
 report=out/(label+'.json')
 if report.exists():result[label]=json.loads(report.read_text())
 else:result[label]={'status':'no-report','exitCode':p.returncode}
dump(out/'raw-results.json',result)
assert all(x.get('status')=='metrics-ok' for x in result.values()),'Offscreen WebKit unavailable; preserve outputs and defer real render to root'
checks=[]
for old,new in zip(result['baseline']['metrics']['cases'],result['candidate']['metrics']['cases']):
 assert old['name']==new['name'];name=new['name'];eligible=name.startswith('native-')
 if not eligible:assert old==new,(name,'out-of-scope changed')
 else:
  s=new['first']['style'];assert s['fontSize']=='15px' and s['lineHeight']=='20px' and s['height']=='40px' and s['paddingTop']=='9px' and s['borderBottomWidth']=='0.5px',(name,s)
  for k in ['fontFamily','fontWeight','paddingRight','paddingBottom','paddingLeft','borderBottomStyle']:assert s[k]==old['first']['style'][k],(name,k)
  assert new['first']['rect']['top']==old['first']['rect']['top'],name
  assert new['later']['style']==old['later']['style'] and new['later']['rect']['height']==old['later']['rect']['height'],name
  assert new['row']['style']==old['row']['style'] and new['row']['rect']['height']==old['row']['rect']['height'],name
  assert new['zero']['style']==old['zero']['style'],name
 assert not result['candidate']['metrics']['requests'],'No remote resources allowed'
 checks.append(name)
dump(out/'result.json',dict(status='pass',checks=checks,sourceSha256=hashlib.sha256((r/'src/style.css').read_bytes()).hexdigest(),limits='Actual offline WKWebView with full production CSS and production DOM structure, no React runtime, real NSWindow, native input or Apple pixel acceptance. Range boxes are not glyph ink; snapshots inspected separately.'))
print('PASS actual offscreen WKWebView same-text metrics across '+str(len(checks))+' scoped and excluded cases')
