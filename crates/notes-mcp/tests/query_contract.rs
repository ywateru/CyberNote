//! Canonical query DTO regressions; this same JSON feeds the real stdio Unix fixture.
use notes_mcp::schema;
use serde_json::{Value, json};

fn fixtures() -> Value {
    serde_json::from_str(include_str!("fixtures/query-success.json")).unwrap()
}

#[test]
fn actual_application_service_fixture_validates_all_nine_tool_schemas() {
    // Exact copy from evolve-111 commit 868c6dcf960cb3c92f3c9330ec22fbaf7431fe91.
    // Source and content hash are recorded in fixtures/service-success.source.json.
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/service-success.json")).unwrap();
    let definitions = schema::definitions();
    let cases = fixture["cases"].as_array().unwrap();
    assert_eq!(cases.len(), 12);
    let mut seen = std::collections::BTreeSet::new();
    let mut read_formats = std::collections::BTreeSet::new();
    let mut operation_states = std::collections::BTreeSet::new();
    for (index, case) in cases.iter().enumerate() {
        let name = case["tool"].as_str().unwrap();
        let definition = definitions.iter().find(|d| d.tool.name == name).unwrap();
        assert!(
            definition.input.is_valid(&case["arguments"]),
            "case {index}: {name} input"
        );
        assert!(
            definition.output.is_valid(&case["result"]),
            "case {index}: {name} output"
        );
        assert!(jsonschema::is_valid(
            &schema::success(name),
            &case["result"]
        ));
        assert!(!jsonschema::is_valid(
            &schema::error_schema(),
            &case["result"]
        ));
        seen.insert(name);
        if name == "notes_read" {
            read_formats.insert(case["result"]["format"].as_str().unwrap());
        }
        if name == "notes_get_operation" {
            operation_states.insert(case["result"]["status"].as_str().unwrap_or("committed"));
        }
        // Success compatibility must not remove the host's scope-denied ToolError branch.
        let denied =
            json!({"code":"FORBIDDEN","message":"Synthetic grant scope denied","retryable":false});
        assert!(definition.output.is_valid(&denied));
        assert!(!jsonschema::is_valid(&schema::success(name), &denied));
        let mut extra = case["result"].clone();
        extra["unexpected"] = json!(true);
        assert!(!definition.output.is_valid(&extra));
    }
    assert_eq!(seen, schema::NAMES.into_iter().collect());
    assert_eq!(read_formats, ["text", "document"].into_iter().collect());
    assert_eq!(
        operation_states,
        ["committed", "pending", "not_found"].into_iter().collect()
    );
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
