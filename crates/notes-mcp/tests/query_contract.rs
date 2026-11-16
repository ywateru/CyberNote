//! Canonical query DTO regressions; this same JSON feeds the real stdio Unix fixture.
use notes_mcp::schema;
use serde_json::{Value, json};

fn fixtures() -> Value {
    serde_json::from_str(include_str!("fixtures/query-success.json")).unwrap()
}

#[test]
fn canonical_query_success_and_tool_error_match_declared_outputs() {
    let fixtures = fixtures();
    for definition in schema::definitions() {
        assert!(definition.output.is_valid(&fixtures["ToolError"]));
        if let Some(success) = fixtures.get(definition.tool.name.as_ref()) {
            assert!(
                definition.output.is_valid(success),
                "{}",
                definition.tool.name
            );
        }
    }
}

#[test]
fn capabilities_require_integer_v1_and_exact_canonical_limits() {
    let validator = jsonschema::validator_for(&schema::success("notes_get_capabilities")).unwrap();
    let canonical = &fixtures()["notes_get_capabilities"];
    for key in ["apiVersion", "schemaVersion"] {
        for invalid in [json!("1"), json!(0), json!(2), json!(1.5), Value::Null] {
            let mut value = canonical.clone();
            value[key] = invalid;
            assert!(!validator.is_valid(&value), "{key}");
        }
    }
    assert_eq!(canonical["limits"].as_object().unwrap().len(), 15);
    for key in canonical["limits"].as_object().unwrap().keys() {
        let mut value = canonical.clone();
        value["limits"].as_object_mut().unwrap().remove(key);
        assert!(!validator.is_valid(&value), "missing {key}");
        for invalid in [
            json!(-1),
            json!(0.5),
            json!("1"),
            json!(9007199254740992u64),
        ] {
            value["limits"][key] = invalid;
            assert!(!validator.is_valid(&value), "invalid {key}");
        }
    }
    for key in ["maxInputBytes", "unknownLimit"] {
        let mut value = canonical.clone();
        value["limits"][key] = json!(1);
        assert!(!validator.is_valid(&value));
    }
    let mut value = canonical.clone();
    value["extra"] = json!(true);
    assert!(!validator.is_valid(&value));
}

#[test]
fn search_requires_strict_match_title_or_content_and_240_character_snippet() {
    let validator = jsonschema::validator_for(&schema::success("notes_search")).unwrap();
    let canonical = &fixtures()["notes_search"];
    for field in ["title", "content"] {
        let mut value = canonical.clone();
        value["items"][0]["match"] = json!({"field":field,"snippet":"中".repeat(240)});
        assert!(validator.is_valid(&value));
    }
    for invalid in [
        json!({"field":"tags","snippet":"中文"}),
        json!({"field":"content","snippet":"中".repeat(241)}),
        json!({"field":"content","snippet":"中文","extra":true}),
        json!({"field":"content"}),
        json!({"snippet":"中文"}),
    ] {
        let mut value = canonical.clone();
        value["items"][0]["match"] = invalid;
        assert!(!validator.is_valid(&value));
    }
    let mut legacy = canonical.clone();
    let item = legacy["items"][0].as_object_mut().unwrap();
    item.remove("match");
    item.insert("matchedFields".into(), json!(["content"]));
    item.insert("snippet".into(), json!("中文"));
    assert!(!validator.is_valid(&legacy));
    let mut mixed = canonical.clone();
    mixed["items"][0]["matchedFields"] = json!(["content"]);
    assert!(!validator.is_valid(&mixed));
}
