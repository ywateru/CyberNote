# Mac 主窗侧栏显隐偏好：任务22接入准备

2026-11-05，Asia/Shanghai。**原版21固定记录支持一个主窗的隐藏状态跨正常新进程保持；克隆18重启后变回可见。当前源码默认 `useState(true)`，已有 Rust settings 的读与单键 patch 可以复用。** 本次为只读准备，没有实现或运行验证；范围限主窗显隐，不扩大为栏宽、多主窗、异常退出或像素通过。

## 固定证据21独立核验

[研究21](../mac-sidebar-restart21/README.md) 索引 SHA256 为 `c53a2fd353b04f7c0f4b32d11b954069748ef0f85cbad5f9f2990f0ddfc27716`；13条大小及 SHA 全匹配，实际14文件包含索引自身。四图均解码为2788×1806 JPEG RGB，独立审看01/04/06原图与全部AX、动作和进程记录；此次没有亲自运行或重启原版。

| 固定记录 | 可支持的事实 |
| --- | --- |
| 00→01 | 文件夹外框从有变无，01图为列表与正文。01按钮 Help 仍短暂为“隐藏文件夹”，不能单凭 tooltip 判断实际状态。 |
| 02→03→05 | 精确 Notes 路径 PID86322；actions记录正常退出，03无匹配进程；05同路径新 PID40579。 |
| 04 | 文件夹外框仍无，图片仍隐藏，AX第94行 Help 为“显示文件夹”。 |
| 06 | 文件夹外框恢复，选中合成目录计数11；Help 为“隐藏文件夹”。原版终态为可见。 |

四份AX的 `QA-TYPE-20261104-01` 合成正文逐字相同，详见[input-manifest.json](input-manifest.json)；仅确认这份可见正文。跨日分组名称变化不作为数据变化证据。固定记录不证明异常退出、多窗或其他视图策略，原版删除试验没有恢复。

[克隆18](../../verification/mac-folder-fixes-runtime18/README.md) 的32图/AX实际隐藏，34图/AX实际可见，尽管34文件名为 `restarted-hidden`。33进程记录为空；准确包身份及旧新PID叙述仅取自其 README，本次没有扩大读取19/36身份文件。因此差距是有限的“原版21 hidden→正常新进程hidden，克隆18 hidden→正常新进程visible”，不作两组不同尺寸内容的整页像素比较。

## 最小源码接缝

行号对应 manifest 中固定字节；后续按符号定位。

| 接缝 | 当前事实与建议 |
| --- | --- |
| [App.tsx](../../../src/App.tsx) 460 | sidebar 固定初始 true，与持久 settings 独立。 |
| App 905–935、1350–1383、825–833 | 首次可信 load 接受后 hydrate；首次 selection 有初始化门槛。侧栏可在首次可信加载只读恢复，不能在每轮 hydrate 重置；passive hydrate 已保留本地 settings。 |
| App 3522–3524、3724–3729、3946、4099–4105 | 原生按钮、显示菜单、DOM隐藏和恢复均只改内存。统一显式 setter，避免只修一个入口。 |
| [types.ts](../../../src/types.ts) 55–65 | Settings 可加明确可选 boolean，例如 `macSidebarVisible`。仅接受实际 boolean；缺失/非法值内存回退 true，零默认写入。 |
| App 992–1003、[bridge.ts](../../../src/bridge.ts) 205–280 | 通用 updateSettings 为乐观 void 写，不检查接受回包且无专用排序。可复用 action，不能把 Promise resolve 或当前 void setter 当持久确认。 |
| [store.rs](../../../src-tauri/src/store.rs) 317–327、670–684、751 | 现有 settings JSON 读、仅 patch 指定键、单条 UPDATE、返回 workspace，足够承载该键；无新表/schema/IPC需求。 |
| [native-toolbar-state.ts](../../../src/native-toolbar-state.ts) 50–59、221–226 | toolbar列状态消费当前 sidebar；独立窗排除 toggle 并强制投影 false。沿用同一状态投影，无需第二份原生偏好或工具栏几何变更。 |

现有调用链是 bridge action → workspace_action → Session ordinary → Store settings 单键 patch。宿主与会话仍使用原访问检查和共享会话锁。首次加载失败沿现有同步错误处理；不得提前写初始 true。避免 `useEffect([sidebar])` 无条件保存，也避免 React 状态 updater 内执行 I/O。

建议把显式用户意图同步保存在内存/ref，再串行写入或合并为最终意图；旧完成不得反转新布局。确认依据应为接受的 workspace 中该键匹配，或必要时可信读回。无 value、访问未接受、maintenanceError、写后完整 workspace 读取失败均不能冒称已确认；settings也不提供实体 receipt，不能要求非空实体收据。失败时保留可操作布局并沿现有错误通道提示偏好未确认保存，不自动写 true 回滚。上述是待开发契约，没有实现声明。

## 必须守住的范围

- Mac 主窗用 `native && macNative && !separate` 界定。[native-toolbar.ts](../../../src/native-toolbar.ts) 15–18区分平台；App 的 mobile 只是宽度小于700的布局状态。窗口缩放不是显隐意图，不产生写入。
- 手机文件夹/正文导航不消费或写 Mac 偏好；[style.css](../../../src/style.css) 1837–1858仍按页面决定手机可见栏。不能用 `!mobile` 作为 Mac 平台检查。
- 独立 note 窗的 false 是投影，不能写成主窗隐藏。宿主 [lib.rs](../../../src-tauri/src/lib.rs) 409–423仍可能向聚焦 note-* 分发菜单，所以新 setter 必须守住主窗边界，不能只依赖独立窗无工具栏按钮。
- 恢复限进程首次可信初始化；后续同步、被动回包、导入和窗口投影不自动写当前默认值。新键遵循现有 settings 保存方式，不扩展存储审计或跨窗实时同步。
- App 964–970仅flush正文；1265–1287关闭保护目前不等待偏好。已确认后正常退出与点击后立即退出是不同边界，任务22应明确承诺范围；本准备不扩展生命周期改造或宣称待写关闭通过。

正式任务的聚焦验证应覆盖首次 false/true/缺失/非法值与零启动写、所有显式入口最终意图顺序、手机和独立窗不写、已确认后准确包正常退出新进程恢复。待写立即退出若纳入承诺，须另有明确关闭处理及证据。源码检查不替代准确包运行或像素验收。

## 保全与停止

[input-manifest.json](input-manifest.json)记录40项输入和收尾复核；[evidence-index.json](evidence-index.json)仅索引本 analysis 与 manifest。只写本新目录，没有修改研究21/18、产品、共享文档或 Git；没有构建、测试、GUI、ADB、DB访问或下载；未读取或触碰 `smart-folders.css`。**STOP：最小准备已完成，交由 root 制定任务22；没有修复或通过声明。**
