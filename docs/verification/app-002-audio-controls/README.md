# APP-002 音频控件触摸入口：源码候选 01

状态：源码候选，等待独立审查及新安装包实测。任务 `app-002-audio-controls-01` 尚未完成；此前 Android 3edc4ad0 包的展开失败仍保留于 `../f07-audio-integration/android-developer01/`。

基线：`6fd3bf8`。本候选不构建安装包，不操作原版应用、模拟器或设备，不使用现有 target。修改限定为 AudioPlayer / AudioPlayerSession、音频 CSS 和定向检查。App、bridge、播放 controller、Rust、依赖、Editor 其余部分均未改动；可比路径及源码 SHA 见 `source-candidate-01/source-integrity.json`。

## 改动与原因

移动端原有箭头隐藏，而 summary 双击会落入编辑器的事件处理。标题/时长区域现在是有 `aria-expanded`、`aria-controls` 的原生按钮，单次触摸、Enter 和 Space 可展开/收回原有进度控件；保留已证标题、时长、播放胶囊的可见结构，不添加永久图标。桌面保留箭头及 summary 空隙双击，标题双击只切换一次，播放按钮双击不展开。

Tiptap 真实 NodeView 的事件边界检查原始 target 的标签。按钮内文字/SVG 的 pointer-events 关闭，使触摸命中按钮本身；卡片取消非 input 的 mousedown 默认行为，阻止正文落下光标，range 保留原生聚焦与拖动。点击不向正文冒泡。移动端标题、播放、±15 秒与 range 提供至少 44px 高的操作区域；播放的透明扩展区域不改变可见胶囊几何。展开后的网格在 280px 视口内不横向溢出。

沿用既有有限时长探测、播放、seek、错误和重试 controller。展开/收回不播放、不复位 currentTime；src 生命周期与卸载释放保持。

## 已执行验证

- `pnpm typecheck`：通过，记录 `source-candidate-01/typecheck.log`。
- `node scripts/check-audio-playback.mjs`：11 组通过，记录 `source-candidate-01/playback-helper.log`。
- `git diff --check`：通过。
- 新 `scripts/check-audio-controls-browser.mjs`：真实 NoteEditor → ReactNodeViewRenderer → MediaView → AudioPlayer 路径，通过本地 preview bridge 写入并读取既有 WebM。Chrome 156.0.8078.80 无界面、静音、独立上下文、仅本地/data 请求；实际按钮文本/SVG 触摸，CDP 原生触摸拖动 range，键盘语义，桌面箭头/双击均通过。结果及截图见 `source-candidate-01/`。
- 既有 `scripts/check-audio-playback-browser.mjs`：真实 WebM / 有限 WAV、播放失败注入、实际损坏媒体错误、重试、切换 src、旧事件及卸载回归通过。仅更新两个展开按钮定位，避免新的标题按钮导致歧义。证据单独保留在 `playback-regression-01/result.json`。

真实受管录音 429547 bytes，SHA-256 `cd7ee9692361fb3502775e8b7efc87ba0957ee22835f10e6d7335b09980fdf4f`，检查前后相同。真实 main audio 初始 `currentTime=0` / `paused=true`，主 metadata 为 Infinity，独立 probe 得有限 66.004 秒、显示 1:06。展开保持 0/paused；实际触摸拖至 30 秒，±15 秒和两端有效。完整 JSON、选区、revision=7 未变，onChange=0，没有编辑器 focus=true 回调。range 可正常获得 INPUT 焦点。卸载后 src=null / paused=true，无页面错误或外网请求。

新检查对生产 `NodeView.prototype.stopEvent` 加了只读观察包装：每次调用原函数，保留原 this、输入和返回值，不替换处理结果。结果捕获 BUTTON touchstart 与 INPUT touchstart/touchmove/keydown 返回 true；未 mock AudioPlayer、NodeView、bridge 函数或播放 controller。preview bridge 的存储为 localStorage，不是 Rust/IPC。

## 证据边界与待验收项

本结果仅为离线 Chrome 156 移动模拟与桌面浏览器检查，不是 Android WebView 91、真实系统 IME、macOS 安装包、Rust ACK 或冷启动持久化验收。未将浏览器无 editor focus 等同于 Android 键盘不弹起。截图展示检查夹具中的真实组件，仅用于事件和布局检查，不是与原版像素对比。

原录屏 36–38 秒没有展示展开手势或展开外观，因此原版单击/双击规则仍未知。本修复不声称补齐未知原版证据，也不宣称像素一致。

独立审查后，需统一新 APK 上使用同一既有 66 秒受管附件，以原生触摸依次展开、播放暂停、拖至约 30 秒、±15 秒、两端、收回，核对实际 main currentTime/paused/range、JSON/revision/字节 SHA 与 IME；保留新包身份和原失败。完成该安装实测后方可评估任务是否满足验收，不改写父音频时长任务的历史状态。

## 重现命令

在已有依赖和外部浏览器工具的环境中执行，不新增依赖：

```sh
pnpm typecheck
node scripts/check-audio-playback.mjs
PLAYWRIGHT_CORE_PATH=/absolute/path/to/playwright-core/index.mjs CHROME_PATH=/absolute/path/to/chrome node scripts/check-audio-controls-browser.mjs /tmp/audio-controls-check
PLAYWRIGHT_CORE_PATH=/absolute/path/to/playwright-core/index.mjs CHROME_PATH=/absolute/path/to/chrome node scripts/check-audio-playback-browser.mjs /tmp/audio-playback-regression
```
