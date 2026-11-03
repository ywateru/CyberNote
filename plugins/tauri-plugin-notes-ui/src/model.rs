use crate::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    NewFolder,
    ToggleSidebar,
    ViewOptions,
    BackToGallery,
    NewNote,
    Format,
    Checklist,
    Table,
    Attachment,
    Share,
    More,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MenuCommand {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    Highlight,
    ColorDefault,
    ColorPurple,
    ColorPink,
    ColorOrange,
    ColorMint,
    ColorBlue,
    StyleTitle,
    StyleHeading,
    StyleSubheading,
    StyleBody,
    StyleMonospaced,
    ListBullet,
    ListDash,
    ListNumber,
    Blockquote,
    ChoosePhotoVideo,
    RecordAudio,
    AttachFile,
    TakePhoto,
    ScanDocument,
    AddSketch,
    PinNote,
    LockNote,
    FindInNote,
    MoveNote,
    RecentNotes,
    MathInsert,
    MathSuggest,
    MathOff,
    AttachmentsSmall,
    AttachmentsLarge,
    DeleteNote,
    ViewGallery,
    ViewList,
    SortDefault,
    SortModified,
    SortCreated,
    SortTitle,
    GroupByDate,
    ViewAttachments,
    ConvertTableToText,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum MenuEntry {
    Item {
        command: MenuCommand,
        label: String,
        enabled: bool,
        selected: bool,
    },
    Separator,
    Submenu {
        label: String,
        items: Vec<MenuEntry>,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MenuDefinition {
    pub owner: Action,
    pub items: Vec<MenuEntry>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionState {
    pub action: Action,
    pub enabled: bool,
    pub selected: bool,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Layout {
    ThreeColumn,
    GalleryExpanded,
    IndependentNote,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GlassStyle {
    Regular,
    Clear,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Columns {
    pub sidebar_visible: bool,
    pub sidebar_width: f64,
    pub list_width: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchState {
    pub enabled: bool,
    pub value: String,
    /// Last native search sequence incorporated by the host; native edits cannot be overwritten by stale state.
    pub acknowledged_event: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolbarState {
    /// Strictly increasing per binding, not the note/document revision.
    pub revision: u64,
    pub layout: Layout,
    pub columns: Columns,
    pub folder_title: String,
    pub folder_count: u64,
    pub table_focused: bool,
    pub actions: Vec<ActionState>,
    pub menus: Vec<MenuDefinition>,
    pub search: Option<SearchState>,
    pub glass_style: GlassStyle,
}
fn text(value: &str, max: usize) -> Result<()> {
    if value.chars().count() > max || value.contains('\0') {
        return Err(Error::new("invalid_state", "文字过长或包含空字符"));
    }
    Ok(())
}
impl ToolbarState {
    pub fn validate(&self) -> Result<()> {
        if self.revision == 0
            || self.revision > 9_007_199_254_740_991
            || self.folder_count > 9_007_199_254_740_991
        {
            return Err(Error::new(
                "invalid_state",
                "版本和计数必须在 JavaScript 安全整数范围内，版本须大于零",
            ));
        }
        let c = &self.columns;
        if !c.sidebar_width.is_finite()
            || !c.list_width.is_finite()
            || !(160.0..=600.0).contains(&c.sidebar_width)
            || !(180.0..=800.0).contains(&c.list_width)
        {
            return Err(Error::new("invalid_state", "分栏尺寸无效"));
        }
        text(&self.folder_title, 256)?;
        if self.actions.len() > 11 || self.menus.len() > 11 {
            return Err(Error::new("invalid_state", "工具项数量超限"));
        }
        let mut actions = HashSet::new();
        for action in &self.actions {
            if !actions.insert(action.action) {
                return Err(Error::new("invalid_state", "重复动作"));
            }
        }
        let mut owners = HashSet::new();
        let mut commands = HashSet::new();
        let mut count = 0;
        for menu in &self.menus {
            if !actions.contains(&menu.owner) || !owners.insert(menu.owner) {
                return Err(Error::new("invalid_state", "菜单没有唯一对应按钮"));
            }
            validate_entries(&menu.items, 0, &mut count, &mut commands)?;
        }
        if let Some(s) = &self.search {
            text(&s.value, 4096)?;
            if s.acknowledged_event > 9_007_199_254_740_991 {
                return Err(Error::new("invalid_state", "搜索确认编号无效"));
            }
        }
        Ok(())
    }
    pub(crate) fn permits(&self, intent: &Intent) -> bool {
        match intent {
            Intent::Action { action } => self
                .actions
                .iter()
                .any(|a| a.action == *action && a.enabled),
            Intent::Menu { owner, command } => {
                self.actions.iter().any(|a| a.action == *owner && a.enabled)
                    && self
                        .menus
                        .iter()
                        .any(|m| m.owner == *owner && enabled_command(&m.items, *command))
            }
            Intent::Search { value, .. } => {
                self.search.as_ref().is_some_and(|s| s.enabled) && value.chars().count() <= 4096
            }
            Intent::WindowActivity { .. } => true,
        }
    }
}
fn validate_entries(
    entries: &[MenuEntry],
    depth: usize,
    count: &mut usize,
    commands: &mut HashSet<MenuCommand>,
) -> Result<()> {
    if depth > 2 || entries.is_empty() {
        return Err(Error::new("invalid_state", "菜单为空或嵌套过深"));
    }
    for entry in entries {
        *count += 1;
        if *count > 96 {
            return Err(Error::new("invalid_state", "菜单项超过96项"));
        }
        match entry {
            MenuEntry::Item { command, label, .. } => {
                text(label, 128)?;
                if label.trim().is_empty() || !commands.insert(*command) {
                    return Err(Error::new("invalid_state", "菜单命令重复或名称为空"));
                }
            }
            MenuEntry::Submenu { label, items } => {
                text(label, 128)?;
                if label.trim().is_empty() {
                    return Err(Error::new("invalid_state", "子菜单名称为空"));
                }
                validate_entries(items, depth + 1, count, commands)?;
            }
            MenuEntry::Separator => {}
        }
    }
    Ok(())
}
fn enabled_command(entries: &[MenuEntry], command: MenuCommand) -> bool {
    entries.iter().any(|e| match e {
        MenuEntry::Item {
            command: c,
            enabled,
            ..
        } => *c == command && *enabled,
        MenuEntry::Submenu { items, .. } => enabled_command(items, command),
        _ => false,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SearchPhase {
    Change,
    Commit,
    Cancel,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Intent {
    Action { action: Action },
    Menu { owner: Action, command: MenuCommand },
    Search { value: String, phase: SearchPhase },
    WindowActivity { active: bool },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToolbarEvent {
    pub window_label: String,
    pub binding_id: String,
    pub state_revision: u64,
    pub sequence: u64,
    pub intent: Intent,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BindingInfo {
    pub window_label: String,
    pub binding_id: String,
    pub state_revision: u64,
    pub native: NativeInfo,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeInfo {
    pub material: Material,
    pub reserved_top: f64,
    pub content_width: f64,
    pub active: bool,
    pub overflow_actions: Vec<Action>,
    pub search_sequence: u64,
    pub full_size_content: bool,
    pub symbol_fallbacks: Vec<SymbolFallback>,
    pub window_number: i64,
    pub scale_factor: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SymbolFallback {
    pub action: Action,
    pub requested: String,
    pub used: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Material {
    GlassRegular,
    GlassClear,
    LegacyHeader,
}
