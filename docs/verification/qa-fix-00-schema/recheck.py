"""Independent public-Store recheck; preserve all previous QA artifacts."""
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
BIN=OUT / "store-probes/target/debug/independent"
OLD=ROOT / "docs/verification/qa-fix-00/schema-fixtures"
(OUT / "original-fixtures").mkdir(exist_ok=True)


def invoke(*args):
    r=subprocess.run([str(BIN),*map(str,args)],check=True,capture_output=True,text=True)
    return json.loads(r.stdout) if r.stdout.strip() else None


def encode(path,value):
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+"\n")


def semantic(value):
    value=json.loads(json.dumps(value))
    for a in value["workspace"]["attachments"]:
        a["bytes"]=value["files"][a["relativePath"]]
        del a["relativePath"]
    for f in value["workspace"]["folders"]:
        if f["id"] in ["default","quick","trash"]:
            f["createdAt"]=0
    for key in ["folders","notes","attachments"]:
        value["workspace"][key].sort(key=lambda x:x["id"])
    return value["workspace"]


negative=[]
for old in sorted(OLD.glob("*.notesbackup")):
    original=old.read_bytes()
    fixture=OUT / "original-fixtures" / old.name
    fixture.write_bytes(original)
    with tempfile.TemporaryDirectory(prefix="notes-qa-schema-negative-") as d:
        root=Path(d)
        invoke("seed",root)
        before=json.loads((root/"before.json").read_text())
        result=invoke("import",root,fixture)
        after=invoke("inspect",root)
        assert not result["accepted"] and result["error"]["code"]=="archive_invalid"
        assert before==after
        assert fixture.read_bytes()==original and old.read_bytes()==original
        staging=root/"target/.imports"
        assert not staging.exists() or not list(staging.iterdir())
        negative.append(dict(fixture=old.name,sha256=hashlib.sha256(original).hexdigest(),result=result,
                             completeWorkspaceSettingsBytesEqualAfterReopen=True,sourceUnchanged=True,noStaging=True))


def paragraph(text="默认正文",marks=None):
    t={"type":"text","text":text}
    if marks is not None:t["marks"]=marks
    return {"type":"paragraph","content":[t]}


valid={
    "omitted-heading-and-mark-attrs":{"type":"doc","content":[{"type":"heading","content":[{"type":"text","text":"默认标题"}]},paragraph(marks=[{"type":"link"},{"type":"highlight"},{"type":"textStyle"}])]},
    "omitted-list-task-code-cell-attrs":{"type":"doc","content":[{"type":"orderedList","content":[{"type":"listItem","content":[paragraph()]}]},{"type":"taskList","content":[{"type":"taskItem","content":[paragraph(),{"type":"taskList","content":[{"type":"taskItem","content":[paragraph("嵌套默认未勾选")]}]}]}]},{"type":"codeBlock","content":[{"type":"text","text":"line 1\nline 2"}]},{"type":"table","content":[{"type":"tableRow","content":[{"type":"tableHeader","content":[paragraph()]},{"type":"tableCell","content":[{"type":"paragraph"}]}]}]}]},
    "out-of-order-and-empty-marks":{"type":"doc","content":[paragraph(marks=[{"type":"highlight","attrs":{}},{"type":"italic"},{"type":"bold","attrs":{}},{"type":"link","attrs":{}}]),paragraph("显式空标记",[]),{"type":"paragraph","content":[{"type":"hardBreak","marks":[{"type":"bold"}]},{"type":"text","text":"换行后"}]}]},
    "custom-nodes-defaults-and-marker":{"type":"doc","content":[{"type":"attachment","attrs":{"id":"$attachment"}},{"type":"drawing"},{"type":"drawing","attrs":{"strokes":[{"tool":"marker","color":"#ff00ff","width":0.5,"points":[[-1.5,0],[10,20.25]]}]}}]},
    "actual-schema-empty-table-row":{"type":"doc","content":[{"type":"table","content":[{"type":"tableRow"}]}]},
}
positive=[]
(OUT/"valid-fixtures").mkdir(exist_ok=True)
for name,document in valid.items():
    with tempfile.TemporaryDirectory(prefix="notes-qa-schema-positive-") as d:
        root=Path(d)
        invoke("seed",root)
        archive=json.loads((root/"source.notesbackup").read_text())
        aid=archive["attachments"][0]["id"]
        document=json.loads(json.dumps(document).replace('"$attachment"',json.dumps(aid)))
        archive["notes"][0]["document"]=document
        fixture=OUT/"valid-fixtures"/f"{name}.notesbackup"
        encode(fixture,archive)
        original=fixture.read_bytes()
        before=invoke("inspect",root)
        result=invoke("import",root,fixture)
        assert result["accepted"],(name,result)
        after=invoke("inspect",root)
        nid=archive["notes"][0]["id"]
        assert next(n for n in after["workspace"]["notes"] if n["id"]==nid)["document"]==document
        for key in ["folders","notes","attachments"]:
            assert all(old in after["workspace"][key] for old in before["workspace"][key])
        for path,data in before["files"].items():assert after["files"][path]==data
        for a in archive["attachments"]:
            current=next(x for x in after["workspace"]["attachments"] if x["id"]==a["id"])
            assert after["files"][current["relativePath"]]==archive["blobs"][a["id"]]
        exported=root/"roundtrip.notesbackup"
        invoke("export",root,exported)
        fresh=root/"fresh"
        fresh.mkdir()
        assert invoke("import",fresh,exported)["accepted"]
        assert semantic(invoke("inspect",fresh))==semantic(after)
        assert fixture.read_bytes()==original
        positive.append(dict(case=name,result=result,inputJsonPreservedAfterReopen=True,
                             oldEntitiesAndBytesPreserved=True,allImportedAttachmentBytesEqual=True,
                             exportReimportSemanticWorkspaceEqual=True,sourceUnchanged=True))

encode(OUT/"independent-schema-result.json",dict(sourceCommit="b5d4fb9e041ffdd51db49a8ca532cafc61bd2c9d",originalRejected=negative,validRoundtrips=positive))
print(f"Original three fixtures rejected unchanged; {len(positive)} independent default/mark/custom-node documents roundtrip unchanged.")
