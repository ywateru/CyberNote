"""Read only original note document/plainText, never credentials or grants.

Stdout is a private pipe to the diagnostic parent, never an archived log.
The parent retains full originals in memory and archives only their digests.
"""
from pathlib import Path
import json
import sqlite3

root = Path('/private/tmp/account109-desktop-real-90b8b28b-01')
result = {}
for name in ['a', 'b']:
    db = root / ('desktop-' + name) / 'notes.sqlite3'
    assert db.is_file() and db.resolve() == db
    conn = sqlite3.connect(db.as_uri() + '?mode=ro', uri=True)
    try:
        conn.execute('PRAGMA query_only=ON')
        notes = [json.loads(row[0]) for row in conn.execute('SELECT body FROM notes ORDER BY id')]
        result[name] = [{'id': n['id'], 'document': n['document'], 'plainText': n['plainText']} for n in notes]
    finally:
        conn.close()
print(json.dumps(result))
