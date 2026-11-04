#!/usr/bin/env python3
"""Replay exact production layout over hide/restore chains; no real window or GUI."""
import ast
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'plugins/tauri-plugin-notes-ui/macos/toolbar.m'
BASELINE = '4d9dcbe'
OUTPUT = ROOT / sys.argv[1]
if shutil.disk_usage(ROOT).free < 2 * 1024**3:
    raise RuntimeError('Less than2GiB available; no output started')
OUTPUT.mkdir(parents=True, exist_ok=False)

# Reuse only the recording ports, not the old script's assertions or layout algorithm.
ports = {}
for node in ast.parse((ROOT / 'scripts/check-wide-toolbar-geometry.py').read_text()).body:
    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('PREFIX', 'SUFFIX') for t in node.targets):
        ports[node.targets[0].id] = ast.literal_eval(node.value)
prefix = ports['PREFIX']
suffix = ports['SUFFIX']
suffix = suffix.replace('@"groups":c.recorded', '@"groups":[c.recorded copy]')
suffix = suffix.replace('for(NSDictionary *item in cases) {', 'NSMutableDictionary *retained=[NSMutableDictionary dictionary];\n    for(NSDictionary *item in cases) {')
suffix = suffix.replace('GeometryController *c=[GeometryController new];',
                        'GeometryController *c=retained[item[@"chain"]];\n        if(!c) {c=[GeometryController new];retained[item[@"chain"]]=c;')
suffix = suffix.replace('NSMutableDictionary *state=',
                        '}\n        ((GeometryView *)c.window.contentView).bounds=NSMakeRect(0,0,[item[@"width"] doubleValue],900);\n        c.window.styleMask=[item[@"fullSize"] boolValue]?NSWindowStyleMaskFullSizeContentView:0;\n        [c.recorded removeAllObjects];\n        NSMutableDictionary *state=')


def methods(source):
    start = source.index('- (CGFloat)widthFor:')
    selected = source[start:source.index('- (NSDictionary *)information', start)]
    assert selected.count('- (void)layout {') == 1
    return selected


actions = ['newNote', 'format', 'checklist', 'table', 'attachment', 'share', 'more']
aux = ['newFolder', 'toggleSidebar', 'viewOptions']
cases = []
for layout in ['threeColumn', 'galleryBrowse', 'galleryExpanded']:
    for width in [700, 1088, 1392]:
        for side in [160, 228]:
            for full in [True, False]:
                chain = f'{layout}-{width}-{side}-{full}'
                allowed = aux+actions if layout == 'threeColumn' else (aux+['newNote'] if layout == 'galleryBrowse' else ['newFolder','toggleSidebar','backToGallery']+actions)
                for phase, visible in [('before', True), ('hidden', False), ('restored', True)]:
                    cases.append(dict(name=chain+'-'+phase, chain=chain, phase=phase, layout=layout,
                                      width=width, sidebarWidth=side, sidebarVisible=visible, listWidth=280,
                                      actions=allowed, search='present', fullSize=full))
for width in [700, 1392]:
    cases.append(dict(name=f'independent-{width}',chain=f'independent-{width}',phase='independent',
                      layout='independentNote',width=width,sidebarWidth=228,sidebarVisible=False,listWidth=280,
                      actions=actions,search='present',fullSize=True))

commands=[]
results={}
current=(ROOT/SOURCE).read_text()
baseline=subprocess.check_output(['git','show',f'{BASELINE}:{SOURCE}'],cwd=ROOT,text=True)
try:
    for kind, source in [('baseline',baseline),('candidate',current)]:
        if shutil.disk_usage(ROOT).free < 2*1024**3:
            raise RuntimeError('Disk guard before compile output')
        generated=OUTPUT/f'{kind}.m'; generated.write_text(prefix+methods(source)+suffix)
        binary=OUTPUT/kind
        argv=['xcrun','clang','-fobjc-arc','-fblocks','-mmacosx-version-min=12.0','-Wall','-Wextra','-Werror','-framework','AppKit',str(generated),'-o',str(binary)]
        r=subprocess.run(argv,cwd=ROOT,text=True,capture_output=True)
        commands.append(dict(command=argv,exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr))
        (OUTPUT/f'{kind}-compile.json').write_text(json.dumps(commands[-1],indent=2)+'\n')
        if r.returncode: raise RuntimeError(kind+' compile failed')
        r=subprocess.run([str(binary)],input=json.dumps(cases),text=True,capture_output=True)
        (OUTPUT/f'{kind}-run.json').write_text(json.dumps(dict(exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr),indent=2)+'\n')
        if r.returncode: raise RuntimeError(kind+' execution failed')
        results[kind]=json.loads(r.stdout)
    checks=[]
    reproduced=[]
    before={}
    for config, old, new in zip(cases,results['baseline'],results['candidate']):
        groups=new['groups']; phase=config['phase']; name=config['name']
        if config['layout']=='independentNote':
            assert not new['visibility']['sidebar'] and 'toggleSidebar' not in new['overflow'],name
            assert old==new,name
            checks.append(dict(name=name,result='independent unchanged; no sidebar action'))
            continue
        assert groups['sidebar']['actions'].count('toggleSidebar')==1,name
        assert new['visibility']['sidebar'] and 'toggleSidebar' not in new['overflow'],name
        # Real placeGroup divides group width equally between action hit frames.
        x,y,width,height=groups['sidebar']['frame']
        item=width/len(groups['sidebar']['actions'])
        center=x+(groups['sidebar']['actions'].index('toggleSidebar')+.5)*item
        assert item==36 and height==36 and center>=(88 if config['fullSize'] else 0),name
        if phase=='hidden':
            assert groups['sidebar']['actions']==['toggleSidebar'] and 'newFolder' not in new['overflow'],name
            assert 'toggleSidebar' in old['overflow'] and not old['visibility']['sidebar'],name
            if config['layout']=='threeColumn' and config['fullSize']:
                assert new['titleFrame'][0]==154,name
            reproduced.append(name)
        if config['sidebarVisible'] and config['sidebarWidth']==160 and config['fullSize']:
            assert groups['sidebar']['actions']==['toggleSidebar'] and 'newFolder' in new['overflow'],name
        if not new['titleHidden']:
            assert new['titleFrame'][0]>=x+width+8,name
        if 'back' in groups:
            bx,by,bw,bh=groups['back']['frame']
            assert bx>=x+width+8 and new['titleFrame'][0]>=bx+bw+11,name
        spans=sorted((v['frame'][0],v['frame'][0]+v['frame'][2],k) for k,v in groups.items() if new['visibility'][k])
        for left,right in zip(spans,spans[1:]):
            assert left[1]<=right[0]+1e-9,(name,left,right)
        if not new['titleHidden']:
            tx,ty,tw,th=new['titleFrame']
            for lo,hi,group in spans:
                assert tx+tw<=lo+1e-9 or tx>=hi-1e-9,(name,'title overlaps',group)
        assert all(0<=lo<=hi<=config['width'] for lo,hi,k in spans),name
        if phase=='before': before[config['chain']]=new
        if phase=='restored':
            expected={**before[config['chain']],'name':name}
            assert new==expected,(name,'restore differs from before')
        # Wide normal three-column geometry must stay byte-for-byte equivalent.
        if config['layout']=='threeColumn' and config['sidebarWidth']==228 and phase!='hidden':
            assert new==old,(name,'normal three-column regression')
        checks.append(dict(name=name,result='direct36pt toggle; no overlap; original hidden action reproduced; restore stable'))
    assert len(reproduced)==36
    result=dict(status='pass',caseCount=len(cases),hideRestoreChains=36,baselineFailuresReproduced=len(reproduced),
                checks=checks,cases=cases,baselineResults=results['baseline'],candidateResults=results['candidate'],
                sourceSha256=hashlib.sha256(current.encode()).hexdigest(),productionMethodSha256=hashlib.sha256(methods(current).encode()).hexdigest(),
                baseline=BASELINE,limits=['Exact unmodified production widthFor/layout over retained recording ports; no NSApplication/real window/control/event/GUI.',
                                         'placeGroup sink records action order and frame; hit calculation applies existing equal division and traffic reservation.',
                                         'No real action, system input, package, menu popup or pixel acceptance.'])
    (OUTPUT/'result.json').write_text(json.dumps(result,indent=2)+'\n')
    print(f'Passed {len(cases)} production states,36 hide/restore chains;36 original failures reproduced.')
except BaseException as error:
    (OUTPUT/'failure.json').write_text(json.dumps(dict(error=repr(error),commands=commands,cases=cases,results=results),indent=2)+'\n')
    raise
