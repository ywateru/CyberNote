#!/usr/bin/env python3
"""Read-only review of the frozen Mac06 runtime AX endpoints."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SOURCE = ROOT / 'docs/verification/mac-sidebar-optical06-runtime-01'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def body_value(text, focused=False):
    prefix = r'^The focused UI element is ' if focused else r'^\t+\d+ '
    matches = list(re.finditer(prefix + r'[^\n]*(?:备忘录正文|Note Body Text View)[^\n]*Value: ([^\n]*)', text, re.M))
    if not matches:
        return None
    assert len(matches) == 1
    match = matches[0]
    value = match.group(1)
    tail = text[match.end():]
    if tail.startswith('\n'):
        for line in tail[1:].split('\n'):
            if line.startswith('\t') or line.startswith('The focused UI element'):
                break
            value += '\n' + line
    # Capture formatting uses one newline before the next AX item/end;
    # QA paragraphs have a known non-newline final character. Retain all
    # internal line breaks and remove only that capture delimiter.
    if value.endswith('\n'):
        value = value[:-1]
    return value

freeze = json.loads((HERE/'input-freeze.json').read_text())
close = []
for item in freeze['files']:
    data = (ROOT/item['path']).read_bytes()
    close.append({'path': item['path'], 'bytesEqual':len(data)==item['bytes'], 'sha256Equal':sha(data)==item['sha256']})
assert all(x['bytesEqual'] and x['sha256Equal'] for x in close)
corpuspath = ROOT/'docs/verification/mac-body-typography-runtime-01/corpus.json'
corpusdata = corpuspath.read_bytes()
corpus = json.loads(corpusdata)['text']
reference = json.loads((HERE/'corpus-reference.json').read_text())
assert sha(corpusdata) == reference['sha256']
assert len(corpus)==257 and len(corpus.encode())==547
states = []
for path in sorted(SOURCE.glob('*.ax.txt')):
    text = path.read_text()
    body = body_value(text)
    focused = body_value(text,True)
    splitters = [line.strip() for line in text.splitlines() if re.search(r'\d+ (?:splitter |分离器 )',line)]
    states.append({
        'file':path.name,
        'splitterCount':len(splitters),
        'splitterDeclarations':splitters,
        'nativeSplitterValues':[float(x) for x in re.findall(r'分离器 [^\n]*\) ([0-9.]+)',text)],
        'folderTreePresent':bool(re.search(r'^\t+\d+ (?:button Notes Clone UI 对照|外框 文件夹)',text,re.M)),
        'directToggleDeclarations':[line.strip() for line in text.splitlines() if re.search(r'button 显示或隐藏文件夹|按钮 Description: 文件夹',line)],
        'newFolderButtonDeclarations':[line.strip() for line in text.splitlines() if re.search(r'button 新建文件夹|按钮 Description: 添加文件夹',line)],
        'folderTitleDeclarations':[line.strip() for line in text.splitlines() if 'text Description:' in line],
        'bodyPresent':body is not None,
        'bodyCodePoints':len(body) if body is not None else None,
        'bodyUtf8Bytes':len(body.encode()) if body is not None else None,
        'bodySha256Utf8':sha(body.encode()) if body is not None else None,
        'bodyEqualsCorpus':body==corpus if body is not None else None,
        'bodyHasNonWhitespace':bool(body.strip()) if body is not None else None,
        'bodyFocused':focused is not None,
        'focusedValueEqualsCorpus':focused==corpus if focused is not None else None,
        'menuActionLabels':re.findall(r'^\t+\d+ (隐藏文件夹|显示文件夹), ID: customAction:',text,re.M),
        'sharePopoverPresent':'popover Secondary Actions: Cancel' in text,
        'acceptanceExcluded':path.name.startswith(('11-','12-','13-')),
    })
by = {int(x['file'][:2]):x for x in states}
qa = [2,3,4,6,8,9,10,14,15,16,17,18,19]
assert all(by[n]['bodyEqualsCorpus'] for n in qa)
assert all(by[n]['focusedValueEqualsCorpus'] for n in qa if n!=14)
assert by[14]['bodyFocused'] is False
assert [by[n]['splitterCount'] for n in [2,3,4,6,8,14,15,16]]==[2,1,2,1,2,2,1,2]
assert all(by[n]['directToggleDeclarations'] for n in [2,3,4,6,8,9,10,14,15,16])
assert all(not by[n]['folderTreePresent'] and not by[n]['newFolderButtonDeclarations'] for n in [3,6,15])
assert all(by[n]['folderTreePresent'] for n in [2,4,8,9,10,14,16])
assert by[5]['menuActionLabels']==['隐藏文件夹'] and by[7]['menuActionLabels']==['显示文件夹']
assert all(by[n]['splitterCount']==2 and not by[n]['bodyHasNonWhitespace'] and by[n]['acceptanceExcluded'] for n in [11,12,13])
assert by[12]['sharePopoverPresent']
assert [by[n]['nativeSplitterValues'] for n in [17,18,19]]==[[228.0,360.0],[361.0],[228.0,360.0]]
initial=json.loads((SOURCE/'01-identity.json').read_text())
cold=json.loads((SOURCE/'20-cold-identity.json').read_text())
assert initial['sha256']==cold['sha256']=='f69b9e3856ebb62ee64c6547d55a420762a31e58ab3b9244391981fff239f8bf'
assert initial['executable']==cold['executable']
assert initial['processes']==['73909 '+initial['executable']]
assert cold['processes']==['74182 '+cold['executable']]
assert initial['oldPID57962Exited'] is True and cold['initialPID73909Exited'] is True
exe=Path(initial['executable']); exedata=exe.read_bytes()
assert sha(exedata)==initial['sha256']
result={
    'verdict':'PASS_FINITE_ENDPOINTS_WITH_EXPLICIT_COLD_START_EXCLUSIONS',
    'sourceHeadAtFreeze':freeze['head'],
    'frozenInputCount':len(freeze['files']),
    'corpus':reference,
    'executableCurrentRead':{'path':str(exe),'bytes':len(exedata),'sha256':sha(exedata)},
    'identityEvidence':{'initial':initial,'cold':cold,'scope':'Recorded process identities and recorded exit booleans; no independent replay/live process query in this review.'},
    'states':states,
    'qaBodyEqualFileNumbers':qa,
    'qaBodyEqualCount':len(qa),
    'qaFocusedEqualCount':sum(by[n]['focusedValueEqualsCorpus'] is True for n in qa),
    'cloneWidthEvidence':'AX has unnamed-value splitter declarations only; 09/10 preserve visible state/body. Separate optical report proves both icons restore rightward by 40 image pixels, without independently segmenting the first divider. 208/228 point labels also use root action ledger, not filenames alone.',
    'coldExclusions':'11–13 all show quick notes, visible folder tree, two splitters and whitespace-only body. 12 also has a share popover. They are not hidden-state passes. 14–16 follow manual QA re-selection.',
    'inputClose':close,
    'allFrozenInputsUnchanged':True,
    'limits':['Endpoints reviewed; GUI actions not independently replayed.','Exit evidence is identity JSON declaration, not an independently captured ps transcript.','No navigation retention, hidden-state persistence, DB-wide integrity, editor object identity, or full-window pixel parity claim.','No GUI/ADB/build/product edit/stage/commit performed.'],
}
(HERE/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'qaEqual':len(qa),'qaFocusedEqual':result['qaFocusedEqualCount'],'rawInputsUnchanged':len(close),'executableSHA':sha(exedata),'resultSha256':sha((HERE/'result.json').read_bytes())},ensure_ascii=False,indent=2))
