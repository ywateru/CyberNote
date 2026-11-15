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
    Settings,
    RecordAudio,
    InsertTag,
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
    RecognizeImageText,
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
    ConvertTextToTable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum MenuEntry {
    Item {
        command: MenuCommand,
        #[serde(rename = "folderId", default, skip_serializing_if = "Option::is_none")]
        folder_id: Option<String>,
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
    GalleryBrowse,
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
    #[serde(default)]
    pub content_overlay: bool,
    pub actions: Vec<ActionState>,
    pub menus: Vec<MenuDefinition>,
    pub search: Option<SearchState>,
    pub glass_style: GlassStyle,
    #[serde(default = "default_font_scale")]
    pub font_scale: f64,
    #[serde(default = "default_font_scale")]
    pub icon_scale: f64,
    #[serde(default = "default_font_scale")]
    pub hit_scale: f64,
    #[serde(default)]
    pub appearance: Appearance,
}
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Appearance {
    #[default]
    System,
    Light,
    Dark,
}
fn default_font_scale() -> f64 { 1.0 }
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
        if !self.font_scale.is_finite() || !(0.5..=1.5).contains(&self.font_scale) {
            return Err(Error::new("invalid_state", "界面字号无效"));
        }
        if !self.icon_scale.is_finite() || !(0.8..=1.2).contains(&self.icon_scale)
            || !self.hit_scale.is_finite() || !(1.0..=1.3).contains(&self.hit_scale) {
            return Err(Error::new("invalid_state", "界面图标或操作区域比例无效"));
        }
        let c = &self.columns;
        if !c.sidebar_width.is_finite()
            || !c.list_width.is_finite()
            || !(80.0..=1200.0).contains(&c.sidebar_width)
            || !(100.0..=1600.0).contains(&c.list_width)
        {
            return Err(Error::new("invalid_state", "分栏尺寸无效"));
        }
        text(&self.folder_title, 256)?;
        if self.actions.len() > 14 || self.menus.len() > 11 {
            return Err(Error::new("invalid_state", "工具项数量超限"));
        }
        let mut actions = HashSet::new();
        for action in &self.actions {
            if !actions.insert(action.action) {
                return Err(Error::new("invalid_state", "重复动作"));
            }
            if matches!(self.layout, Layout::GalleryBrowse)
                && !matches!(
                    action.action,
                    Action::NewFolder
                        | Action::ToggleSidebar
                        | Action::ViewOptions
                        | Action::NewNote
                        | Action::Settings
                )
            {
                return Err(Error::new(
                    "invalid_state",
                    "画廊浏览顶部不能包含笔记编辑动作",
                ));
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
            if matches!(menu.owner, Action::Format) && !format_entries_only(&menu.items) {
                return Err(Error::new("invalid_state", "格式弹层只能包含固定格式命令"));
            }
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
            Intent::Menu { owner, command, folder_id } => {
                self.actions.iter().any(|a| a.action == *owner && a.enabled)
                    && self
                        .menus
                        .iter()
                        .any(|m| m.owner == *owner && enabled_command(&m.items, *command, folder_id.as_deref()))
            }
            Intent::Search { value, .. } => {
                self.search.as_ref().is_some_and(|s| s.enabled) && value.chars().count() <= 4096
            }
            Intent::WindowActivity { .. } => true,
        }
    }
}
fn format_entries_only(entries: &[MenuEntry]) -> bool {
    entries.iter().all(|entry| match entry {
        MenuEntry::Separator => true,
        MenuEntry::Submenu { items, .. } => format_entries_only(items),
        MenuEntry::Item { command, .. } => matches!(
            command,
            MenuCommand::Bold
                | MenuCommand::Italic
                | MenuCommand::Underline
                | MenuCommand::Strikethrough
                | MenuCommand::Highlight
                | MenuCommand::ColorDefault
                | MenuCommand::ColorPurple
                | MenuCommand::ColorPink
                | MenuCommand::ColorOrange
                | MenuCommand::ColorMint
                | MenuCommand::ColorBlue
                | MenuCommand::StyleTitle
                | MenuCommand::StyleHeading
                | MenuCommand::StyleSubheading
                | MenuCommand::StyleBody
                | MenuCommand::StyleMonospaced
                | MenuCommand::ListBullet
                | MenuCommand::ListDash
                | MenuCommand::ListNumber
                | MenuCommand::Blockquote
        ),
    })
}
fn validate_entries(
    entries: &[MenuEntry],
    depth: usize,
    count: &mut usize,
    commands: &mut HashSet<(MenuCommand, Option<String>)>,
) -> Result<()> {
    if depth > 2 || entries.is_empty() {
        return Err(Error::new("invalid_state", "菜单为空或嵌套过深"));
    }
    for entry in entries {
        *count += 1;
        if *count > 512 {
            return Err(Error::new("invalid_state", "菜单项超过512项"));
        }
        match entry {
            MenuEntry::Item { command, folder_id, label, .. } => {
                text(label, 128)?;
                if let Some(id) = folder_id {
                    text(id, 128)?;
                    if *command != MenuCommand::MoveNote || id.trim().is_empty() {
                        return Err(Error::new("invalid_state", "无效移动目标"));
                    }
                }
                if label.trim().is_empty() || !commands.insert((*command, folder_id.clone())) {
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
fn enabled_command(entries: &[MenuEntry], command: MenuCommand, folder_id: Option<&str>) -> bool {
    entries.iter().any(|e| match e {
        MenuEntry::Item {
            command: c,
            folder_id: target,
            enabled,
            ..
        } => *c == command && target.as_deref() == folder_id && *enabled,
        MenuEntry::Submenu { items, .. } => enabled_command(items, command, folder_id),
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
    Menu { owner: Action, command: MenuCommand, #[serde(rename = "folderId", default, skip_serializing_if = "Option::is_none")] folder_id: Option<String> },
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
    #[serde(default)]
    pub popup_menus: bool,
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
