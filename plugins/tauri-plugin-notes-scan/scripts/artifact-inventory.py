#!/usr/bin/env python3
"""Read built artifacts; no install/device access. Writes explicit model byte and source identities."""
import datetime, hashlib, json, pathlib, struct, sys, zipfile

plugin = pathlib.Path(__file__).resolve().parents[1]
output = pathlib.Path(sys.argv[1]).resolve()
apk = plugin / 'android/harness/build/outputs/apk/debug/harness-debug.apk'
aar = plugin / 'android/build/outputs/aar/notes-scan-standalone-debug.aar'
def digest(data): return hashlib.sha256(data).hexdigest()
def identity(path):
    data = path.read_bytes()
    return dict(path=str(path), bytes=len(data), sha256=digest(data))
models, libraries = [], []
with zipfile.ZipFile(apk) as archive:
    for name in sorted(archive.namelist()):
        if not (name.startswith('assets/mlkit-google-ocr-models/') or name.endswith('.so')):
            continue
        data = archive.read(name)
        entry = dict(name=name, bytes=len(data), compressedBytes=archive.getinfo(name).compress_size, sha256=digest(data))
        if name.endswith('.so'):
            if data[:5] == b'\x7fELF\x02':
                phoff, phsize, phnum = struct.unpack_from('<Q', data, 32)[0], struct.unpack_from('<H', data, 54)[0], struct.unpack_from('<H', data, 56)[0]
                entry['loadSegmentAlignments'] = [struct.unpack_from('<Q',data,phoff+i*phsize+48)[0] for i in range(phnum) if struct.unpack_from('<I',data,phoff+i*phsize)[0] == 1]
            libraries.append(entry)
        else:
            models.append(entry)
assert any('Hani_ctc/optical/lstm_model.fb' in m['name'] and m['bytes'] > 0 for m in models)
assert any('libmlkit_google_ocr_pipeline.so' in m['name'] for m in libraries)
sources = []
for path in sorted(plugin.rglob('*')):
    relative = path.relative_to(plugin)
    if not path.is_file() or any(part in {'target','build','.gradle','.kotlin','.tauri','.cache'} for part in relative.parts):
        continue
    if path.name == 'local.properties': continue
    data=path.read_bytes()
    sources.append(dict(path=str(relative),bytes=len(data),sha256=digest(data)))
record = dict(createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    apk=identity(apk), aar=identity(aar), models=models, nativeLibraries=libraries,
    bundledModelBytes=sum(m['bytes'] for m in models),
    note='Model/native bytes observed inside APK. First-offline recognition, camera hardware, UI parity and main-app integration NOT verified.',
    sources=sources)
output.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(apk=record['apk'],aar=record['aar'],modelFiles=len(models),modelBytes=record['bundledModelBytes']),indent=2))
