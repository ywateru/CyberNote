// This imports the actual Store/crypto/archive implementation without changing it.
#[path = "../../../../../src-tauri/src/store.rs"]
#[allow(dead_code)]
mod store;

use serde_json::{json, Value};
use std::{fs, path::Path};

const PASSWORD: &str = "FIX03-synthetic-only-2026";

fn write(path: &Path, value: &Value) {
    fs::write(path, serde_json::to_vec_pretty(value).unwrap()).unwrap();
}

fn make_fixture(root: &Path, name: &str, document: Value, expected_valid: bool) -> Value {
    let work = root.join("fixture-work").join(name);
    fs::create_dir_all(&work).unwrap();
    let mut source = store::Store::open(work.join("source")).unwrap();
    let created = source.action(json!({"type":"createNote"})).unwrap();
    let id = created["id"].as_str().unwrap();
    source
        .action(json!({"type":"saveNote","id":id,"revision":0,"document":document}))
        .unwrap();
    // Actual unencrypted archive export traverses the production schema validator.
    let schema = source.export_archive(&work.join("plaintext-validation.notesbackup"));
    assert_eq!(
        schema.is_ok(),
        expected_valid,
        "unexpected schema result for {name}"
    );
    let schema_error = schema
        .err()
        .map(|e| json!({"code":e.code,"message":e.message}));
    source
        .action(json!({"type":"lockNote","id":id,"password":PASSWORD}))
        .unwrap();
    let archive_path = root.join("fixtures").join(format!("{name}.notesbackup"));
    source.export_archive(&archive_path).unwrap();
    let archive: Value = serde_json::from_slice(&fs::read(&archive_path).unwrap()).unwrap();
    let locked = archive["notes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == id)
        .unwrap();
    assert_eq!(locked["plainText"], "");
    assert_ne!(locked["document"], document);
    assert!(locked["sealed"]["ciphertext"].as_str().unwrap().len() > 24);
    // A cold Store must accept the outer encrypted archive without knowing a password.
    let mut imported = store::Store::open(work.join("imported")).unwrap();
    imported.import_archive(&archive_path).unwrap();
    let before = imported.workspace().unwrap();
    let hidden = before["notes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == id)
        .unwrap();
    assert_eq!(hidden["plainText"], "");
    assert_ne!(hidden["document"], document);
    let wrong =
        imported.action(json!({"type":"unlockNote","id":id,"password":"WRONG-FIX03-synthetic"}));
    assert_eq!(wrong.as_ref().unwrap_err().code, "password");
    // Baseline observation only: do not assert that malformed unlock should succeed.
    let unlock = imported.action(json!({"type":"unlockNote","id":id,"password":PASSWORD}));
    let unlock_error = unlock
        .as_ref()
        .err()
        .map(|e| json!({"code":e.code,"message":e.message}));
    let after = imported.workspace().unwrap();
    let visible = after["notes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == id)
        .unwrap();
    let matches_document = visible["document"] == document;
    if expected_valid {
        assert!(unlock.is_ok() && matches_document);
    }
    write(
        &root.join("fixtures").join(format!("{name}.document.json")),
        &document,
    );
    json!({"name":name,"archive":format!("fixtures/{name}.notesbackup"),"plaintextDocument":format!("fixtures/{name}.document.json"),"noteId":id,"expectedDecryptedSchemaValid":expected_valid,"actualPlaintextArchiveValidationError":schema_error,"outerEncryptedArchiveImported":true,"wrongPasswordRejected":true,"baselineCorrectPasswordUnlockAccepted":unlock.is_ok(),"baselineCorrectPasswordUnlockError":unlock_error,"baselinePublishedDocumentMatchesFixture":matches_document,"purpose":"fixture integrity and pre-fix observation; not FIX03 acceptance"})
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    // Reruns use fresh Store roots; delivered archives use random IDs/salts/nonces.
    let work = root.join("fixture-work");
    if work.exists() {
        fs::remove_dir_all(&work).unwrap();
    }
    fs::create_dir_all(root.join("fixtures")).unwrap();
    let rich = json!({"type":"doc","content":[
        {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"FIX03 合法加密富文档"}]},
        {"type":"paragraph","content":[{"type":"text","text":"PRIVATE-RICH-MARKER-2026","marks":[{"type":"bold"},{"type":"highlight","attrs":{"color":"#cfa7f4"}}]},{"type":"hardBreak"},{"type":"text","text":"第二行 中文"}]},
        {"type":"bulletList","attrs":{"listStyle":"dash"},"content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"短划线项目"}]}]}]},
        {"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":true},"content":[{"type":"paragraph","content":[{"type":"text","text":"已完成"}]}]}]},
        {"type":"blockquote","content":[{"type":"paragraph","content":[{"type":"text","text":"引用"}]}]},
        {"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","content":[{"type":"paragraph","content":[{"type":"text","text":"A"}]}]},{"type":"tableCell","content":[{"type":"paragraph"}]}]}]}
    ]});
    let drawing = json!({"type":"doc","content":[
        {"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"FIX03 合法加密绘画"}]},
        {"type":"paragraph","content":[{"type":"text","text":"PRIVATE-DRAWING-MARKER-2026"}]},
        {"type":"drawing","attrs":{"strokes":[{"tool":"pen","color":"#112233","width":2.5,"points":[[10,10],[80,70],[140,20]]},{"tool":"marker","color":"#ffcc00","width":12,"points":[[20,90],[140,90]]}]}}
    ]});
    let bad_structure = json!({"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"FIX03 非法内部结构"}]},{"type":"paragraph","content":[{"type":"paragraph","content":[{"type":"text","text":"PRIVATE-INVALID-STRUCTURE-2026"}]}]}]});
    let bad_attribute = json!({"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"FIX03 非法绘画属性"}]},{"type":"paragraph","content":[{"type":"text","text":"PRIVATE-INVALID-DRAWING-2026"}]},{"type":"drawing","attrs":{"strokes":[{"tool":"spray","color":"#000000","width":2,"points":[[1,2]]}]}}]});
    let cases = vec![
        make_fixture(root, "valid-rich", rich, true),
        make_fixture(root, "valid-drawing", drawing, true),
        make_fixture(root, "invalid-structure", bad_structure, false),
        make_fixture(root, "invalid-drawing-attribute", bad_attribute, false),
    ];
    let result = json!({"status":"fixtures-prepared-not-fix-pass","syntheticPassword":PASSWORD,"construction":"Production Store saveNote, lockNote (Argon2 + AES256-GCM), export_archive, cold import_archive, unlockNote; no crypto reimplementation or production edit","cases":cases});
    write(&root.join("fixture-result.json"), &result);
    println!("{}", serde_json::to_string_pretty(&result).unwrap());
}
