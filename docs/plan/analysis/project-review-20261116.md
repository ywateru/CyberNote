# 项目梳理与演进建议（2026-11-16）

状态：代码阅读与后续设计；本轮只更新文档，没有实现 MCP、切换产品 UI、重打安装包或重新验收设备。

## 结论与阅读顺序

CyberNote 已具备可靠性要求较高的本地富文本产品基础。下一步应把现有存储、授权、保存和同步协调能力整理为共享应用服务，让桌面 UI、移动 UI 与 agent 使用同一条业务路径；主题与展现方式作为独立呈现层扩展。无需为 MCP 另建笔记数据库，也不宜先整体重写前端。

| 阅读目的 | 文档 |
| --- | --- |
| 当前代码、问题与优先级 | 本页 |
| Agent 查询、读取、写入接口和一致性 | [Agent MCP 契约](../../architecture/agent-mcp.md) |
| 主题、明暗、密度、布局的数据与代码边界 | [主题与呈现架构](../../architecture/theme-presentation.md) |
| 桌面、移动与设置的具体交互 | [自适应界面方案](../../ui/adaptive-presentation.md) |
| 交付顺序、任务与验收 | [实施路线图](../project-evolution-20261116.md) |

## 当前结构与所有权

```text
React App / Tiptap
 ├─navigation              页面、目录、搜索与返回
 ├─editor-session          焦点、选区、格式/绘画/菜单
 ├─editor-menus            动作与菜单投影
 ├─attachment-operations   导入、剪贴板、预览与画廊操作
 └─platform                AppKit 工具栏、Android 键盘、系统事件
             │ src/bridge.ts：Tauri invoke / 浏览器预览分支
             ▼
src-tauri/src/lib.rs        命令装配、窗口身份与事件
 ├─Session                 授权 token、保存 intent、窗口屏障、metadata
 ├─Store / SQLite          笔记/目录/设置、schema 校验、CAS、归档
 ├─attachments/            媒体原文件、操作日志与恢复
 ├─attachment_media        授权租约、按需读取、缩略图、本机 HTTP
 └─account / sync          账户、设备、版本、同步与应用内采纳

api/index.ts → services/coordinator → CyberGrid 连接/设备等服务
crates/account-auth、plugins/*、vendor/cybergrid-sdk 提供各自边界能力
```

`api/index.ts` 是 coordinator 的部署入口，当前不是备忘录内容 CRUD API。coordinator 不应直接充当本地资料库的 MCP 存储服务。附件媒体已有本机 HTTP，但它是媒体租约服务，不能直接开放为笔记写入 API。

代码阅读基线为本地主分支 `ce55674c`。规模仅用于说明职责集中程度：`App.tsx` 5,200 行、`style.css` 3,650 行、`desktop.css` 916 行、`lib.rs` 1,009 行、`store.rs` 1,367 行；数字不是性能或缺陷证明。

## 已有能力，后续应复用

| 能力 | 当前入口 | 对后续的意义 |
| --- | --- | --- |
| 文档结构与类型 | `src/types.ts`、`src/editor-schema.ts`、Rust archive 校验 | JSON 富文本是正文真源；纯文本是派生结果 |
| 保存并发保护 | `store.rs:480` 附近 `saveNote`、`session.rs:325` 的 `save` | 已有 revision CAS 与窗口保存 intent，不能旁路 |
| 授权与跨窗屏障 | `session.rs`、`lib.rs:240` 附近 `mutate_with_stage` | 锁定、删除、导入等已有 prepare/ACK/commit 流程 |
| 已提交事实通知 | `store/commits.rs`、`session/metadata.rs`、`src/metadata-client.ts` | agent 写入后沿用 receipt 和窗口刷新机制 |
| 本地资料库单宿主 | `startup.rs:51` 的 `Workspace::open` | 同一 canonical 目录由应用 lease 持有；另起 MCP 进程不能另开写入会话 |
| 同步本地协调 | `session/synchronization.rs`、`src/network-sync.ts` | 提取可复用协调思想；现有 sync API 并非通用外部写接口 |
| 媒体与恢复 | `attachment_media/*`、`store/attachment_operations*` | 后续附件 MCP 需复用 owner、路径校验、授权与 journal |
| 外观基础 | `Preferences.tsx`、`interface-details.ts`、`font-size.ts` | 已有明暗、五档字号、图标/命中区/圆角设置 |
| 原生 Android 身份 | `platform/layout.ts` | 原生 Android 不随横屏或 IME resize 切成桌面交互 |

## 发现与建议

| 优先级 | 代码事实 / 风险 | 建议与完成标准 |
| --- | --- | --- |
| P0 | 外部写入尚无正式入口；`Session::save` 依赖真实窗口 intent，存储 CAS 不覆盖窗口内未注册的 pendingDocs | 新增应用服务和外部写协调；不能伪造窗口 intent 或仅检查数据库 revision。真实编辑窗口与 agent 并发必须保全双方内容 |
| P0 | `Store::visible` 会按进程内钥匙解密；UI 已解锁不应自然等于所有 agent 被授权 | MCP 单独的客户端/目录授权，首版排除全部 locked 笔记及其搜索派生信息 |
| P1 | `Store::workspace` 返回完整笔记正文与附件元数据；`App.tsx:561` 附近搜索对全量数组过滤，清单还做 document stringify | 增加摘要查询与按需正文；先测大库基线再引入索引/虚拟化。MCP 从一开始分页，不能返回整个 workspace |
| P1 | 菜单/导航/附件/平台已拆模块，但 App 仍集中保存、刷新、同步、投影和大段页面 JSX | 按应用服务、数据订阅、页面容器继续拆分，保留原有控制器所有权；不以搬文件代替消除重复状态 |
| P1 | `Settings.theme` 只有 system/light/dark，`view` 只有 list/gallery；颜色定义同时存在 style、desktop 及组件 CSS | 配色、明暗、布局、密度分开建模；语义 token 集中定义，原生投影声明支持范围 |
| P1 | README 当前包表、顶部账户包描述、INDEX 11-16 更新与 plan/README 11-07“当前”并存 | 新建简短当前状态入口，后续由真实 release manifest 生成平台各自入口；历史记录继续保留，不能凭文档日期重标包 |
| P1 | README 保留 Android 长按导致格式面板关闭的 FORMAT102 未关闭记录 | 优先核对当前准确包能否复现；采用实体机输入/长按/Back 场景验收，不因源码已有 session 就判修复 |
| P2 | 依赖中 Tiptap 多包使用不同版本下限，实际安装版本须以 lockfile 为准；大量脚本与历史验证入口并存 | 先核对解析版本，再统一兼容版本策略和分层命令入口；避免仅为齐版本做无验证升级 |
| P2 | 主题偏好、栏宽、选中项、内容相关设置目前在同一个 Settings 对象 | 区分设备偏好、资料库偏好与笔记内容；明确备份/同步策略后再迁移，不能顺带改变同步 wire |

以上 UI 问题包含静态风险与历史未关闭记录，本轮没有启动应用，不能据此声称当前设备发生了某个运行缺陷，也没有获得本轮性能测量。

进一步静态审查确认：移动字号存在固定值未贯通、≤1100px桌面栏宽计算与拖动区间矛盾、双列卡片和174px侧滑操作栏存在几何冲突；桌面画廊键盘打开、分栏键盘/取消及view保存失败保持也有缺口。具体位置、影响和验收统一记在[双端交互问题表](../../ui/adaptive-presentation.md#当前代码可确认的问题)，避免在本页重复维护。移动画廊已经与桌面view隔离，新增移动列表应扩展该边界，不能退回共用一个view设置。

## 建议的目标边界

```text
桌面 Shell ─┐                       ┌─Session/授权与外部写协调
移动 Shell ─┼─ NotesApplicationService ─Store/正文校验/CAS/receipt
MCP Adapter ┘                       └─同步事实发布与窗口 metadata
    │
    └─只做协议、客户端授权、DTO、限额与错误映射

ThemeRegistry → 语义 token → UI 组件 / 原生能力投影
PresentationPreferences → Desktop/Mobile Shell → 同一稳定 EditorSession
```

应用服务首批在原生宿主进程内建立模块即可。等 UI 和 MCP 都使用真实实现、依赖界面稳定后，再决定是否抽为 `crates/notes-core`；不要为了目录整洁先迁移全部 Store/同步代码。

## 项目整理方式

1. 保留根 `src/`、`src-tauri/`、`plugins/`、`crates/`、`services/` 主结构；按职责渐进迁移。
2. 前端建议增加 `workspace/`（订阅与摘要）、`presentation/`（偏好与布局）、`themes/`（注册表与 token）、`shells/`（双端页面装配）；已有 navigation/editor-session 继续持有原状态。
3. 原生建议增加 `application/`（查询/命令/外部写协调）、`agent_access/`（授权/幂等/审计）、`agent_host/`（本机 IPC）；独立 stdio 可执行程序只依赖协议 DTO/IPC 客户端。
4. 保留现有 synthetic、浏览器、Rust、原生设备验证的范围标注；整理为 core / UI / native / release 四层入口，不把历史长日志继续堆到主阅读入口。
5. 本轮不删除 research、verification、artifacts 或笔记数据，不批量重命名模块。整理完成的标准是读者能找到当前契约、代码 owner 和有效验证入口。

## 产品方向取舍

- Apple Notes 风格保留为默认兼容预设。新主题与展现方式按自己的明确规格验收；原版像素目标只约束声明兼容的预设和状态，不能要求纸张/高对比等新主题也匹配原版。
- 第一批主题建议 Classic、Paper、High Contrast；第一批展现方式为现有列表/画廊加专注阅读。三栏是桌面导航布局，列表/画廊是集合视图，两者不要混成一个枚举。
- 第一批 agent 能力为查询、读取、新建、追加、受版本保护的更新。删除/附件/后台服务有单独阶段，不把模型平台名称写入业务存储。
- 当前优先顺序是共享业务与数据保全 → MCP 最小闭环 → 主题 token → 双端呈现扩展 → 性能与高级能力。可在共享接口稳定后并行做主题，不能并行修改同一个保存/授权 owner。
