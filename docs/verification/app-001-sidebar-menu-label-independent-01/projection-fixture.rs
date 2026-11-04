use std::{collections::HashMap, sync::{Arc, Mutex}};
#[derive(Debug)] struct Error;
impl Error { fn new(_: &str, _: impl Into<String>) -> Self { Self } }
type Result<T> = std::result::Result<T, Error>;
type Bindings = Arc<Mutex<HashMap<String, Binding>>>;
struct Binding { state: ToolbarState }
struct ToolbarState { columns: Columns }
struct Columns { sidebar_visible: bool }
fn project_sidebar_menu(
    map: &Bindings,
    label: &str,
    apply: impl FnOnce(&str) -> Result<()>,
) -> Result<()> {
    if label != "main" {
        return Ok(());
    }
    let title = map
        .lock()
        .map_err(|_| Error::new("state", "顶部绑定锁损坏"))?
        .get(label)
        .map(|record| {
            if record.state.columns.sidebar_visible {
                "隐藏文件夹"
            } else {
                "显示文件夹"
            }
        });
    if let Some(title) = title {
        apply(title)?;
    }
    Ok(())
}

#[test]
fn guard_released_before_sink_and_each_projection_reads_current_binding() {
    let map: Bindings = Arc::new(Mutex::new(HashMap::from([(
        "main".into(), Binding { state: ToolbarState { columns: Columns { sidebar_visible: true } } }
    )])));
    project_sidebar_menu(&map, "main", |title| {
        assert_eq!(title, "隐藏文件夹");
        let mut guard = map.try_lock().expect("production projection must release binding lock before sink");
        guard.get_mut("main").unwrap().state.columns.sidebar_visible = false;
        Ok(())
    }).unwrap();
    project_sidebar_menu(&map, "main", |title| {
        assert_eq!(title, "显示文件夹", "second projection must read current binding");
        assert!(map.try_lock().is_ok());
        Ok(())
    }).unwrap();
    project_sidebar_menu(&map, "note-independent", |_| panic!("independent window must not project main menu")).unwrap();
}
