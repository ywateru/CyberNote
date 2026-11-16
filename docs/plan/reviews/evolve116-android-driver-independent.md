# evolve116 Android driver 独立审查

2026-11-17。审查对象：`codex/evolve-116-android-driver`，提交 `35018fac235f044c94177f7c6660db502240eb27`，父提交 `280584f36da5826e41c37bf735b4e9e9e21bb072`。审查者未参与实现。

**工具模块结论：BLOCKED，1 项 P2 blocking，未发现 P1；native acceptance：OPEN。** 阻塞来自可在组件层确认的观测错误，与尚未执行设备验收无关。仅新增本报告，不修改实现或作者脚本。

## P2 blocking：readUI 读取隐藏的旧 Editor

- 位置：[driver:270](../../../scripts/verification/evolve116-android-driver.mjs#L270)。`document.querySelector('.tiptap')`直接选择文档顺序中的第一个 Editor，没有排除隐藏/inert/不可见宿主。
- 实际产品路径：[App:735](../../../src/App.tsx#L735)会将智能文件夹中的笔记加入 `parkedSmartEditors`；[App:4877](../../../src/App.tsx#L4877)先渲染这些 Editor，再加入当前目标。[SearchEditorHost:281](../../../src/App.tsx#L281)对非当前目标设置 `hidden`、`inert`、`display:none`，但保留 Editor DOM。这条路径没有 desktop-only 限制。
- 反例：按上述 DOM 顺序提供隐藏旧笔记 `parked` 和可见当前笔记 `current`，使用 VM 执行 driver **未经修改的 Runtime.evaluate 表达式**。`readUI()`成功返回 `parked` 的正文、选区及 `focused:false`，而非当前笔记。因而后续正文/焦点/selection 验收可能错误归属，甚至把残留旧状态当作当前操作结果。
- 作者测试未覆盖：其 [fake evaluate:67](../../../scripts/verification/evolve116-android-driver.test.mjs#L67)匹配字符串后直接返回预设 UI 对象，没有执行观测表达式。
- 最小修正：从当前可见且不属于 hidden/inert 宿主的 Editor 定位；零个时返回 `editor:null`，多个时明确拒绝歧义；读取其 `data-note-id` 与 Editor 状态。增加实际执行观测表达式的“隐藏旧 Editor 在前、当前 Editor 在后”回归，并覆盖无可见/多个可见目标。无需改 App。

复现证据保留在 `/tmp/evolve116-independent-W1xn2F/probes.test.mjs` 与 `probes.tap`。关键输出：

```text
INDEPENDENT_READ_UI {"expected":"current","actual":"parked","document":{"type":"doc","content":[{"type":"paragraph","text":"parked"}]},"focused":false}
not ok 8 - readUI must observe visible active editor, not earlier hidden/inert parked editor
Expected values to be strictly equal: actual 'parked', expected 'current'
```

该探针是源码对应的 DOM 查询语义桩，不是真实 WebView 或 APK 运行证据；它执行真实观测表达式，未预设 `readUI` 的结果。产品实际保留/隐藏顺序由上述源码独立确认。

## 其余审查结果

本提交只新增 driver、27 项 driver 测试及作者说明，共三个文件。task116 末节允许独立 prep；旧 Samsung driver、App、共享构建流程均无改动。

- 身份输入：八个必填配置字段，无设备/包/端点默认；限定 emulator serial、AVD、APK SHA-256、单一 PID/cmdline、唯一前台 Activity。APK splits、歧义前台或页面拒绝；CDP 仅连接该 PID 的 forward、唯一 Tauri page 与本地 WebSocket authority。
- 停止行为：操作前重新核验 AVD/boot/APK/PID/前台/page；多步 click/fill 在输入事件间再次核验。错误毒化 session，不重放写操作。独立探针补验事件中途 PID/page 改变，已发送的 press/keyDown 不回滚，随后 release/keyUp/insertText 不发送，也不补发。这与文档的有界预检限制一致。
- 生命周期：跨 evidence 目录的同 UID/server-port/serial lease；拒绝并发操作，close 等待在途操作且幂等；核对完整 forward tuple、reverse port pair，只删除仍精确匹配的本轮映射。换 AVD/boot 不清理设备映射。清理失败可见、释放本地 token 验证的 lease，保留映射需主线程处理；没有自动重试或 remove-all。
- 敏感输入：邀请串仅进入 CDP 内存，不进入 adb argv 或 identity receipt；默认 adb/CDP 失败使用固定错误，页面异常不透出异常正文。定向与独立失败探针均未发现邀请正文出现在抛出的 stack、adb 参数或 identity.json。
- 执行前提：[作者说明](../../verification/evolve116-android-driver.md)明确要求 already running / installed / foreground / **debuggable App**，Node 22，已有且协议兼容的 adb daemon；工具不 boot/install/build/start/kill adb。CDP 插文仅用于数据准备。

未新增独立 P1/P2 nonblocking 项。上述通过项仅是工具行为与源码审查结果，不能抵消 readUI 阻塞。

## 实际验证命令与结果

工作目录为本审查工作树，Node `v22.16.0`。

| 命令 | 实际结果 |
| --- | --- |
| `node --check scripts/verification/evolve116-android-driver.mjs` | exit 0 |
| `node --check scripts/verification/evolve116-android-driver.test.mjs` | exit 0 |
| `node --test scripts/verification/evolve116-android-driver.test.mjs scripts/verification/sync108-android-lifecycle.test.mjs` | exit 0；29 tests，29 pass，0 fail/cancelled/skipped；约 1.44 s |
| `node --test /tmp/evolve116-independent-W1xn2F/probes.test.mjs` | exit 1；8 tests，7 pass，1 fail；失败为上述 readUI 反例，原始日志见 `probes.tap` |
| `git diff --check 35018fac^ 35018fac` | exit 0，无输出 |
| `git diff HEAD --exit-code -- src src-tauri scripts docs/verification` | exit 0，无输出；实现、产品源码及作者材料保持原样 |
| `git diff --check`及本报告链接检查 | exit 0；新增报告的 6 个相对文件链接均指向现存文件，行号 anchor 均在对应文件范围内 |

独立 7 项通过分别覆盖：mousePressed 后换 PID；Ctrl+A keyDown 后换 page；不确定插文失败的脱敏/不重放；split APK 零 forward/input；空 WebView 精确清理；换 boot 零清理写入并释放本地 lease；映射删除失败可见且不重试。均使用独立 fake transport，没有调用作者 fixture 或真实 adb。

审查前后源码校验依据：`git ls-tree -r HEAD src src-tauri | shasum -a 256` 为 `bd64139fb0efd35209c1925a4ae7c3f06b871e52757f3a0a857296254a20f32b`。driver SHA-256 为 `9233c71d27f3bf4cbc5249567bb468e199768c88647c77fb0ec460e4057a8fe0`，作者 test 为 `925e8e42c97274faaa2f3212d82000598db972a43d196bf18936d638393dffc6`；工作树差异仅本报告。

本次没有构建、启动 App、boot/安装、执行真实 adb、操作手机或原库、使用共享 target。作者的 fake executable/fake protocol server 也仅为隔离测试。准确 APK、真实多客户端同步、原生 IME/Back/旋转/手势、FORMAT102 及最终 release APK 均仍 OPEN；debuggable/CDP 工具通过不能替代这些门槛。修复并复核 readUI 后才能将工具模块改为 PASS，115 正式独审等待其开发提交。

## 2026-11-17 增量复核：readUI P2 已闭合

复核修复提交 `c9d0b328f1b980232b19ba214fbeec6a26d6eea1`，基于原独审提交 `b8c7afb6374824a225054cb8627d0deb6f5ec8f4`。**当前工具模块结论：PASS；未发现新增 P1/P2 blocking 或 nonblocking；native acceptance 仍 OPEN。** 上文 BLOCKED 结论、原失败输出及原探针保持为历史证据，本节为最新结论。

修复仅修改 driver、其定向测试和作者说明。[driver:270](../../../scripts/verification/evolve116-android-driver.mjs#L270)现在枚举 `.tiptap`，排除断开节点、hidden/inert 宿主、不可见 computed visibility、任一祖先的 display:none/零 opacity，以及无正宽高矩形的候选。无候选返回 `editor:null`；多个候选在读取任何 Editor 状态之前返回计数，由外层转换为 `UI_EDITOR_AMBIGUOUS`，沿既有 operation 失败路径停止 session。不根据 noteId 或 focus 猜测目标。唯一候选才提供正文、选区及焦点。

独立探针沿用上一轮自己的 fake transport，在新的临时文件中补全查询/样式/矩形语义，并执行修复后的原始观测表达式；没有调用作者 fixture 或预设 readUI 返回值。结果 **4/4 pass**：

1. 原失败场景重新验证：隐藏/inert `parked` 在前、可见 `current` 在后，现在返回 `current` 的完整正文、selection 和 focus。被排除 Editor 的状态 getter 若被访问会直接失败。
2. 补查嵌套 hidden/inert、跨两层宿主零 opacity、display:none、visibility:collapse、空/零面积矩形和断开节点；唯一可见候选即使未聚焦、首个矩形为零而后续矩形有效，仍正确返回，且不泄露内部 `editorCount`。
3. 无 Editor 或只剩隐藏宿主时返回 null，保留 viewport；之后出现唯一可见 Editor 可继续读取，session 未被误停。
4. 两个同 noteId、仅一个 focused 的可见 Editor 仍拒绝歧义，未读取任一正文/选区/focus getter；随后 Back 与再次 readUI 均为 `SESSION_STOPPED`，没有 CDP/OS 输入。

证据目录：`/tmp/evolve116-independent-incremental-yx7f_mba/`，文件 `readui-probes.test.mjs`、`readui-probes.tap`。关键输出为 `CLOSED_ORIGINAL_P2 {"noteId":"current","document":{"type":"doc","content":[{"type":"paragraph","text":"current"}]},"selection":{"anchor":3,"head":8},"focused":true}`。原目录 `/tmp/evolve116-independent-W1xn2F/` 未覆盖；原 probe/test 日志 SHA-256 分别仍为 `efff4e4fbaa7514e0fba4738b97cd591992cf5ad612256c4fd85ba29e7a0c8fc`、`98b3f6362847e3725fba4216b65da867c81ebf20a8ba59f63e5a28ea78f2b76d`。

实际命令与结果（Node `v22.16.0`）：

| 命令 | 实际结果 |
| --- | --- |
| `node --check scripts/verification/evolve116-android-driver.mjs` | exit 0 |
| `node --check scripts/verification/evolve116-android-driver.test.mjs` | exit 0 |
| `node --test --test-reporter=spec scripts/verification/evolve116-android-driver.test.mjs` | exit 0；31/31 pass，0 fail/cancelled/skipped；约 1.48 s |
| `node --test /tmp/evolve116-independent-incremental-yx7f_mba/readui-probes.test.mjs` | exit 0；4/4 pass，0 fail/cancelled/skipped |
| `git diff --check c9d0b328^ c9d0b328` | exit 0，无输出 |
| `git diff HEAD --exit-code -- src src-tauri scripts docs/verification` | exit 0，无输出 |
| `git diff --check`、`git diff --cached --check`、报告链接检查 | exit 0；报告 7 个相对链接的文件及行号均有效 |

产品源码树摘要仍为 `bd64139fb0efd35209c1925a4ae7c3f06b871e52757f3a0a857296254a20f32b`。本次修复后 driver/test SHA-256 分别为 `632eedb646cd7efeae85218d117fb3f7a326c2a31c5326f3880f6398b3185276`、`ecd11615ae391418e5c4105c3a466f85eb34dec16fc7a371843b78b29d4ecf4b`；独审仅追加本报告。未重跑未变的 lifecycle 测试，未构建、启动 App、触真实 adb/设备/原库或共享 target。全部新增验证仍是工具层 fake transport/DOM 语义验证，不能证明准确 release APK、IME/FORMAT102 或最终设备功能；115 正式独审继续等待开发提交。
