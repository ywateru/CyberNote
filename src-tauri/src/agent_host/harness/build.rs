// Compile the real host + real agent_access. Extract only application error/time
// and ID validation definitions, avoiding a second Session/Store or any fake service.
use std::{env, fs, path::PathBuf};
fn function(source: &str, prefix: &str) -> String {
    let start = source.find(prefix).expect(prefix);
    let open = source[start..].find('{').unwrap() + start;
    let mut depth = 1;
    for (i, b) in source.bytes().enumerate().skip(open + 1) {
        if b == b'{' {
            depth += 1;
        }
        if b == b'}' {
            depth -= 1;
        }
        if depth == 0 {
            return source[start..=i].to_string();
        }
    }
    panic!("unterminated function")
}
fn main() {
    println!("cargo:rerun-if-env-changed=EVOLVE111_ROOT");
    let root = PathBuf::from(
        env::var("EVOLVE111_ROOT")
            .expect("Set EVOLVE111_ROOT to the read-only 111 checkout (or merged source)"),
    );
    let app_path = root.join("src-tauri/src/application/mod.rs");
    let access_path = root.join("src-tauri/src/agent_access/mod.rs");
    let model_path = root.join("src-tauri/src/sync/model.rs");
    for p in [&app_path, &access_path, &model_path] {
        println!("cargo:rerun-if-changed={}", p.display());
    }
    let app = fs::read_to_string(app_path).unwrap();
    let start = app.find("pub type ToolResult").unwrap();
    let end = app.find("impl From<ToolError>").unwrap();
    let application = format!(
        "use serde::{{Serialize, Deserialize}};\n{}\n{}",
        &app[start..end],
        function(&app, "pub(crate) fn now()")
    );
    let model = fs::read_to_string(model_path).unwrap();
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    fs::write(output.join("application.rs"), application).unwrap();
    fs::write(
        output.join("model.rs"),
        function(&model, "pub fn valid_id("),
    )
    .unwrap();
    fs::write(
        output.join("access.rs"),
        // The eight-argument constructor is the upstream contract, not our API choice.
        format!(
            "#[allow(clippy::too_many_arguments)] #[path = {:?}] pub mod agent_access;",
            access_path
        ),
    )
    .unwrap();
}
