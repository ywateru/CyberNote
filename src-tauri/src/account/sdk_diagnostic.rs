//! Finite native-only diagnostic boundary. SDK auth events, profiles, endpoints
//! and upstream error strings are deliberately excluded.
pub(crate) fn snapshot() -> Result<serde_json::Value, &'static str> {
    if !super::super::sync::network::diagnostics_enabled()
        || std::env::var("CYBERNOTE_ACCOUNT_SDK_DIAGNOSTICS").as_deref() != Ok("1")
    {
        return Err("diagnostics_disabled");
    }
    Ok(
        serde_json::json!({"schemaVersion":2,"transport":"cyberbus","route":"unknown","diagnosticsAvailable":false}),
    )
}
