// Production sync model + Store/Session sync implementation; transport needs Tauri
// and is covered by the full native crate check, not replaced with a fake backend.
#[path = "../../../sync/model.rs"]
pub(crate) mod model;
