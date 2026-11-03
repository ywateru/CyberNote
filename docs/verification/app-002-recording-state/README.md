# RecordingPanel 局部状态候选

日期：2026-11-04。基线 `72c93b1b34bcfd3a95c331d1da93e187ff5fda14`，隔离工作树 `/private/tmp/apple-notes-recording-state-01`。状态：待独立审查的源码候选。实现与检查由同一开发执行者完成，下面不冒充独立验收。

## 行为与责任

```text
挂载 idle（零权限请求）
    → 显式红圆开始 → requesting → production Session 实际开始
    → recording ↔ paused
                     → 底部完成 → finalizing（真实 stop / 等最后数据及 onstop）
                                    → 单次构造实际 MIME File → saving
                                       ├─ onDone reject → retry → 同一 File 再提交
                                       └─ onDone resolve → submitted（等待父卸载）
任意取消/卸载 → 关本地回调入口 / 释放采集 / 清 preview URL
```

`src/RecordingPanel.tsx` 保持 `onCancel()` / `onDone(File):Promise<void>` 接缝，不触及笔记、访问票据、Editor、Store、Rust 或父 IPC。`phase` 同步 ref 在异步 React 更新前关闭重复开始/完成入口。最终 File 只构造一次；拒绝时保持同一实例。父 Promise resolve 后组件本地进入 submitted 并禁用再次提交，不自行宣称正文持久成功；当前基线 App 吞错和提前关闭的缺口仍须父任务修复。取消/卸载不代表已经发出的父 IPC 已被撤销。

`src/recording-clock.ts` 以 `performance.now()` 累计活动区间；50ms 回调只请求重绘，迟到回调不丢失活动时间。暂停/错误/卸载结束活动区间。显示到百分之一秒，向下截取；UI 时间不用于音频 metadata，也不证明有效音轨或编码时长。

paused 完成会真实 stop 并立即让 production Session 释放采集；末块和 onstop 未到前不提交。空 Blob、空 MIME、非支持音频 MIME 和非请求的 onstop 都显示失败。实际 MIME 按 recorder 返回值保留；支持 WebM/MP4/Ogg/WAV/AAC/MPEG，对未知格式明确拒绝，不凭空给字节贴格式。等待终止事件设 15 秒工程超时，届时 dispose 并关闭后续数据入口；该超时是本实现活性策略，不是原版观测值。

## 局部布局

`src/RecordingPanel.css` 仅覆盖录音区域，并提高选择器权重以不依赖组件 CSS 与全局 CSS 的加载顺序。标题/日期、黄色中央线、活动计时、中央圆/暂停胶囊/继续胶囊、底部右侧完成，依据 [手机录音测量规格](../../ui/recording-mobile.md) 的相对关系定位。已有波形样本从中央线向左排列，数据仍来自 production Session 分析器。

手机未显示顶部取消文字，保留宿主 Android Back 的卸载清理和面板 Escape；桌面仍有可点击取消。未加入无功能省略菜单、回放/±15 或转写按钮；上述缺失区域、实际字体、细节材料、时间轴、动画和桌面原版测量仍待后续。重试时原生 audio 控件使用实际收尾 Blob 创建的 preview URL，可随卸载释放；它是工程错误恢复界面，不冒称录屏里的原版回放布局。

## 已执行检查

- [typecheck.txt](typecheck.txt)：`pnpm typecheck` 通过。
- [cleanup-26.json](cleanup-26.json)：未改动的 production RecordingSession 既有 26 项资源清理检查通过。该检查中原名 auto-start 指 helper 显式 start，不指组件挂载。
- [browser/result.json](browser/result.json)：17 场景挂载真实生产 RecordingPanel，沿真实 production RecordingSession 运行；仅 MediaRecorder、getUserMedia、AudioContext、平台计时、URL 为受控边界。StrictMode mount 不采集；显式开始去重；暂停/继续与延迟重绘；完成等末块一次提交；同 File 失败重试；空/异常 MIME；异常 stop/收尾超时；取消/卸载/晚权限/晚数据及 stop；父保存中卸载不重复提交。
- [browser/geometry.json](browser/geometry.json)：390×844 headless 手机模拟中的三态标题、波形、计时、操作行和完成坐标一致。以下是克隆组件的受控截图，不是 Apple Notes 原图： [初始](browser/mobile-idle.png)、[录制](browser/mobile-recording.png)、[暂停](browser/mobile-paused.png)。波形为受控平台样本。
- [source-manifest.json](source-manifest.json)：产品/检查源码 SHA，App、bridge、Editor、Session、共享 CSS、依赖声明/锁文件与基线相同；Rust 无 diff。未构建、未占用 target、未操作 GUI 或设备。`git diff --check` 通过。

复跑（需工作树依赖可用，使用已存在 Chrome/Playwright；不安装依赖）：

```sh
pnpm typecheck
node scripts/check-recording-session.mjs
PLAYWRIGHT_CORE_PATH=/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-recording-panel-browser.mjs /private/tmp/recording-panel-review
```

检查脚本启本机临时 HTTP；外网请求全部阻止，pageerror 与外网请求结果均为空。不访问用户浏览器。受控 interval 只调度本组件/Session 使用的 50/100ms 回调，其他开发服务 interval 不作为活动时间来源；15 秒终止超时由测试显式触发，不等待真实 15 秒。媒体字节是可识别的测试 payload，不是编码音频，原生 audio 解码/播放不在检查断言中。

## 明确未验收

无真实麦克风、编码音轨、可听播放、Android/iOS/macOS 安装包或新设备证据；无 App→正文持久 ACK、附件持久去重、冷启恢复的本次证明。手机仅 headless Chrome 模拟；224×480 有损参考图不能作为高清像素通过。完成态退出、实际权限路径和本地资源状态须父接线进入同一新包后串行验证。
