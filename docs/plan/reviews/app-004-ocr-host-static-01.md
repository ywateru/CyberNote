---
id: app-004-ocr-host-static-01
task: app-004-ocr-host-01
baseline: 8bc8ae2f712ebf85ec0cd79453318563e3d83a8b
candidate: 2ad1e89423d1be6e872c248bfcae92ff2abade62
result: blocked-p2-retained-ocr-preview-state
date: 2026-11-04
---

# OCR 宿主独立源码审查 01

**候选 2ad1e89 暂不通过源码门禁：发现一项 P2，原目标访问失效后 OCR 预览明文仍保留在 React 状态中。** 面板已隐藏、原生会话已清理，不能据此声称已发生可见泄漏；但它不满足现有授权撤销时清除正文/预览缓存的契约。已交开发修复，须新冻结候选复审；本轮未修改产品源码或合并。

所有源码读取和检查均在 root 建立的独立 detached 树 `/private/tmp/apple-notes-ocr-host-review01`。不读取开发 WIP 或主工作树产品源码。证据目录为 `docs/verification/app-004-ocr-host-independent-01/`，包括 exact 身份、diff、命令、原始 stdout/stderr、两份失败复现、截图与 manifest。

## P2：失效及已完成 OCR 的预览状态没有清除

位置：冻结 `src/App.tsx:2247` 的 `ocrLifecycle.suspend`，以及 `src/App.tsx:2148` 的 `finishOcr`。`suspend` 同时由 access prepare（969）与 `clearSensitive`（906）调用；它只封入场、设置 detached、隐藏面板并取消原 session，没有清 `ocrState`。`finishOcr` 也仅移除 operation/panel。独立搜索显示 `setOcrState` 只在初始化、新开操作及当前活动操作回调赋值，没有终结或失效清除。

两条独立回归断言均使用冻结的实际 App AST 闭包、生产 OcrHost/guest/bridge/SaveQueue 和受控合成 OCR/数据库响应，没有挂载完整 App，也没有模拟已完成真实系统锁定：

1. 合成识别文字 → 对原 note 执行实际 `suspend` → 等待原 session 取消。结果 `detached=true`、`accepting=false`、`currentOperation=null`、`visiblePanel=false`、`nativeSessions=0`，但 React `ocrState` 仍为 `recognized` 且保有完整合成明文。期望失效预览文字为空的断言 exit 1。见 `ocr-sensitive-state-repro.mjs` 及对应 stdout/stderr/command。
2. 合成识别文字 → 实际 App 确认/保存回调 ACK → 清理成功并移除 operation → 再执行原 note 的 `suspend`。结果 `documentAck=true`、`cleaned=true`、`nativeSessions=0`，但 React `ocrState` 仍为 `saved` 且保有明文。此时 operation 已为空，单独在有活动 operation 的 suspend 分支添加清除也覆盖不到。独立断言 exit 1。见 `ocr-sensitive-state-completed-repro.*`。

修复应在正确的 owner 终结/失效时清除 UI 预览缓存，并证明晚结果不能重填。不要为了清 UI 而删除已 ACK 正文、未 ACK 的 pending 文档、同操作保存恢复身份或仍需清理的原 session。需要保留原有保存失败重试与 ACK 后仅清理的边界。本项是确定的内存状态残留；本轮没有证明用户可见旧文字、任意读取内存或真实设备锁定泄漏。

## 身份及实际检查

开始 Git status 为空，HEAD 为完整候选 SHA。14 个产品文件的大小及 SHA-256 全部匹配作者 manifest，按 `SHA256(sum(hash + "  " + path + "\n"))` 复算聚合为 `50232142de0ca96d6ec4786eccde73232aff54b17196c781448587b96d3161ab`。22 个声明保护文件逐项与 baseline 原始 Git 内容相同。结束后再次核对 14+22 个文件未变、HEAD 未变、status 仍为空。

| 独立检查 | 实际结果 | 范围 |
| --- | --- | --- |
| 原冻结 `check-ocr-host.mjs` | 27 项，exit 0 | 实际 App 闭包、控制器、typed guest、bridge、授权/同步、保存队列、PM 事务/history；平台与数据库响应受控 |
| 原冻结 `check-ocr-panel-browser.mjs` | 第二次 7 项，exit 0 | 真实挂载 OcrPanel，受控 props/callback 和合成 File，Chrome 156；pageErrors/externalRequests 均空 |
| 原生工具栏状态 | 13 项，exit 0 | 新 typed action、不可用目标和原连续互通禁用项 |
| 录音父接线 | 20 项，exit 0 | 仅冻结基线中的父边界；不含后来主线合入的 preview，未将其算入本候选 |
| 附件提交 / 取消 | 23 / 8 项，exit 0 | 检查共享 `validatePickerTarget` 改动没有破坏既有受控边界 |
| 类型检查 / diff check | exit 0 / 0 | `tsc --noEmit`、baseline 到候选 `git diff --check` |
| 主 Mac / Android 与独立 scan Mac metadata | 三次 exit 0 | `--offline --locked --filter-platform`，只解析，不编译 |
| 独立预览缓存回归 | 两次 exit 1 | 上述同一 P2 的活动/已完成两种 owner 边界 |

Panel 首次原样运行被临时本地端口限制阻止，exit 1（EPERM），stdout/stderr 及命令保存为 `panel-attempt01.*`。获得必要执行权限后运行同一冻结脚本，第二次 7 项通过，保存为 `panel-attempt02.*`；没有修改断言、增加等待或将第一次失败覆盖。脚本自己的 finally 关闭无头浏览器和本地服务。

实际查看独立生成的两张 PNG：390px 图中合成 HTML 按字面显示、空行保留；320px 图的底部出现截断/重复画面观测，未查明原因，因此不能从本次截图宣布视觉布局通过。7 项的 DOM 几何断言仍是实际通过（面板与 44px 操作位于视口内，长文字可滚动）；这项观测不作为已证实的产品源码缺陷，也不归因为材质或浏览器原因。所有原图保留。

## 实际链路与保留边界

- Mac `recognizeImageText` 是新增的 typed **工具栏意图**：TS union 与 Rust camelCase enum 对齐，toolbar state 发布“从图片识别文本…”，App 对原 NativeContext 重新验选区后打开同一 OcrHost。AppKit 从公开 menu entries 构建菜单，发送 command，Rust 的 state/permits 仍验证 owner 与 enabled command；没有新增名为 recognizeImageText 的 OCR 引擎方法。原拍照/连续互通扫描项仍禁用。
- 主 path Cargo、Builder、capability 明确注册 notes-scan；`ocr-native` 调用现成 typed guest 的 `plugin:notes-scan|execute`，Rust Request 拒绝未知字段并分发桌面 SessionStore 或 Android mobile plugin。Mac 只有用户选择的非空 image File、最多 20 MiB，受限 FileReader/ingest；没有任意路径 IPC 或永久图片附件。原生引擎、Android 源码和模型未改。
- 打开前固定原 note/Editor、完整文档、trusted 原正文、版本、书签、access stamp 与 operation；原生及普通入口共用路径。确认前仍使用现有 `rebindAttachmentTarget` 的成功可信同步、原 session/global/note epoch、原 owner/Editor/正文/版本检查；只重绑纯 renderer generation，没有放宽 AccessGate。
- 真实 App 插入闭包使用原书签与一次 PM replaceSelection，换行转换普通段落、HTML 字面保持。即使 dispatch 在实际变更后抛错，finally 仍捕获已变文档身份，避免重插。重复确认复用同 Promise；插入后保存失败只对本操作完全相同 pending/Editor 正文窄重试，保留 trusted 原正文核验。
- ACK 来自实际 `saveDoc` 队列中生产 bridge action 的成功返回，并按原 note 与完整文档相等确认。仅 ACK 后 native acknowledge；清理失败进入 cleanup-pending，重试不重插、不重保存。此轮 invoke/DB 为受控响应，不等价于真实 Rust Store 持久提交通过。
- 取消先封入场、等待已发 native/确认工作终态、只清原 session；插入但未 ACK 不删除 pending 正文。原 close owner 在首次 await 前封住 OCR 与录音，晚 File 回调仍绑定原 operation。现有 27 项覆盖上述主要交错，但没有检查 UI 预览缓存抹除，故未发现本轮 P2。

## build dependency 例外的必要性

实际变更的是 scan 的 **build dependency `tauri-plugin`** 精确版本 `2.6.3 → 2.7.2`，不是 OCR 模型、runtime Tauri 或新 OCR API。候选主 lock 仅增加 notes-scan path 包/主依赖；scan 独立 lock 仅修改该 package 的 version/checksum。既有 notes-ui 的 build dependency 已精确为 2.7.2。

独立生成一次可丢弃的 manifest 级诊断：使用冻结候选的主/ui/scan descriptors，仅把 scan Cargo.toml/lock 逐字节恢复到 baseline。离线 metadata exit 101，原始 stderr 明确显示 notes-ui 要求 `=2.7.2` 与 scan 已选 `=2.6.3` 无法同时解析。该新诊断保存在 `builddep-baseline-diagnostic.*`，descriptor hashes 单列；没有原生编译或改候选。候选原样三次 filtered metadata 均通过。因此这一窄兼容修正在源码/解析层有独立依据；不能外推 native 构建通过。

作者 `attempt-history.json` 中最初 panel 等待问题、未过滤 metadata 的 atk 缓存失败、最初精确依赖冲突均明确为 **此前工具输出的转录**。本轮按原样留存，不能称为作者首次尝试的原生原始日志。上面的独立 dependency 诊断与 Panel EPERM 是本轮新产生、单独保存的原始输出，二者不混记。

## 释放及剩余范围

只临时创建指向主 node_modules 的本 review 树 symlink，结束已验证精确目标并移除；本轮自建 Vite cache 和可丢弃 dependency diagnostic 目录也已移除。源码与保护边界结束 hash 全同，工作树干净。没有下载、升级、原生构建、共享 target、GUI、设备、相机或用户数据操作。

结论为 **BLOCKED，等待 P2 修复新冻结**。真实 Vision/Android OCR 与权限、完整 App mounted 调用、Rust DB ACK、Undo/Redo 正常退出冷启、实体相机、无 GMS、材料精度和原版像素仍未由本轮证明。完整文稿、多页/PDF、扫描集合长期存储与复裁仍属后续任务；本轮不关闭 APP-004。
