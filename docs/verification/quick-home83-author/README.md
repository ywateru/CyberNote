# Android 快速画廊首页 83：作者定向验证

2026-11-06，产品冻结为 `d73e1f30a04ccf578f7df64b2a2b873a18c3d64d`，基线为 `acd5a46a`。作者只修改本任务隔离树的前端与调试 runner；不修改 Rust、原生媒体控制器、附件存储、依赖或锁文件。不操作已安装应用、设备、原 Android 约 13 秒未保存录音或真实麦克风。最终独立审查、主线组合回归与 Mac26 / Android16 准确构建由根统一执行。

## 实现与边界

- 手机首次进入全部有效笔记的两列画廊，不恢复隐藏编辑器，不读取其媒体 payload；保留持久 `settings.selectedNote`，点卡片或真实＋才挂载编辑器。手机画廊是派生呈现，不改共享桌面 `settings.view` / `groupDates`。桌面断点仍为 700px。
- ＋复用真实 `createNote`，手机同步单飞，成功收据先于元数据激活；同来源重试恢复同一成功收据，不再创建第二实体。导航 generation 与注册的 exact Tiptap 身份约束聚焦；聚焦调用既有 keyboard bridge。手机初始化与迟到结果不聚焦隐藏或无关编辑器。
- 来源与存储 owner 分开：all / smart 新建实际存 default，返回原 scope；物理目录保持 owner。未命中 smart 的新建 receipt 仅在当前手机 editor 意图、明确授权且非删除时保留选中能力，真实 listed / smart count 仍为零。
- 文件夹、设置为次级入口；编辑页短返回、历史、更多、完成，底部真实格式/清单/附件/绘画。完成 flush 并收起键盘。Back 按既有 overlay / media 优先级，再返回来源画廊、全部首页；根 Back 不绕过在途创建或附件。
- 新增 `app.folders` / `editor.done` 调试指令，复用真实处理器。`quick-home` 为 mobile-only CLI allowlist，**未加入 desktop `groupNames`**，在手机 `attachments` 链末 reset 后仅调用一次。旧手机 preferences runner 只适配入口及桌面偏好标签，保留原业务断言。

## 最终有效检查

| 命令 | 结果 | 完整外层 wall |
| --- | --- | ---: |
| `/usr/bin/time -p node scripts/debug/cli.mjs group quick-home --mobile --out docs/verification/quick-home83-author/quick-home05` | 自然 exit 0，45 项，`pageErrors=[]` | 18.57s |
| `/usr/bin/time -p pnpm exec tsc -b --pretty false` | 自然 exit 0 | 2.54s |
| `/usr/bin/time -p node docs/verification/quick-home83-author/style-preview.mjs` | 自然 exit 0，生成最终 390px 首页/编辑页静态预览 | 2.56s |
| `git diff --check` | exit 0 | 未单独计时 |

命令完整输出在 [quick-home05.log](quick-home05.log)、[typecheck-final.log](typecheck-final.log)、[style-preview-final.log](style-preview-final.log)。调试 CLI 的 `elapsedMs=18326` 包含启动与组执行，外层 18.57s 另包含最终清理；不把组内耗时当完整 wall。

45 项的实际条目见 [suite.json](quick-home05/suite.json)，源码身份、原始状态和页面错误见 [summary.json](quick-home05/summary.json)，所有断点和 200% 文字几何见 [quick-home83-layout.json](quick-home05/quick-home83-layout.json)。最终检查在提交前对同一字节完成，summary 的 `sourceHead` 因此仍是基线且 gitDirty=true；提交后 [frozen-source.json](frozen-source.json) 确认产品冻结提交、126 个输入 SHA-256 `c4fcc377e3ac0b1bac640e4a29fdc3039cf3e558dff3491ef43f1981611cdfd1` 与检查前后逐字相同，冻结后产品 clean。没有用提交后的新源码追认旧测试。

覆盖真实 DOM 双击＋及语义创建单飞、实际输入/完成/保存/重载、物理及 smart 来源、smart 零结果仍能实际输入/格式/图片/录音保存且 owner 正确、创建失败重试、metadata 成功收据恢复、迟到结果不抢焦点、pending 根 Back 保留实体、锁定正文不出现在首页 HTML、82 设置/数据与实际 gear 返回焦点、FileList 附件正文 ACK、带附件笔记冷启无隐藏 `.tiptap` / `read_attachment`，点击卡片才读取并解码图片、合成录音关闭保存、320/390/430/800 浅深布局、短屏末卡避让＋、200% 模拟文字和 root flush/模拟退出。

200% 通过只证明临时 CSS 字号放大后卡片内容及日期的布局，不代表 Android 系统字体缩放。browser fixture 的 PNG 和音频是合成数据，真实 App / Tiptap / 保存处理器参与；持久化和 OS 边界为显式 JS fixture，不冒充真实 Rust Store、Android IME/provider/TCC 或后台录音服务验收。

## 最终预览

[style-home-390.png](style-home-390.png) 和 [style-editor-390.png](style-editor-390.png) 为真实页面、八条合成中文笔记的 390×844 截图，[首页 HTML/几何](style-home-390.snapshot.json) 同存。作者已实际查看：圆角白卡，卡片底层无红橙色 swipe bleed，亮黄 `#ffbc00` ＋，44px 搜索且无装饰 Mic；编辑页没有重复新建或常驻 Share，编辑控件可达。原始脚本 [style-preview.mjs](style-preview.mjs) 仅在 fixture backend 放置合成数据，截图关闭转场动画，不操纵产品 DOM 渲染目标。

这些是候选页面局部静态审阅，未做与原版的同态整窗像素差分，不宣称像素级一致或双端完整交付。

## 失败原件与修正原因

| 运行 | 已通过检查 | 失败与处理 |
| --- | ---: | --- |
| quick-home01 | 28 | runner 将实际“录音”菜单写成“录制音频”，真实定位超时。保留原日志、HTML/状态、PNG；恢复交接后确认拥有 Node 已退出，不补造当时清理 wall。 |
| quick-home02 | 25 | 强化锁定 fixture 时把秘密插入公开标题，期望标题不可见是错误断言；改为真实 `editor.setContent` 的第二段正文。自然 exit 1。 |
| quick-home03 | 31 | runner 错误限定图片 `blob:` URL，真实媒体源为已解码的 `data:`。改验 `complete && naturalWidth > 0` 与实际读取次数。自然 exit 1。 |
| quick-home04 | 42 | 800→320 断点后 page-in 动画未结束，几何右边界尚在移动；在短屏测量前结束该页面转场，保留实际 scrollWidth 和 rect 原件，不修改产品掩盖布局。自然 exit 1。 |

四次失败目录、完整输出均保留，没有将失败记录改为通过，也未删除业务断言。早期 typecheck / formatting / preview 日志仅为开发过程原件，最终有效结论只使用上表最终命令。

## 移交

产品源码冻结后不再更改；index.html 无差异，作者未生成 dist（该 worktree 无 dist 目录），没有存留临时入口。拥有的 CLI / preview / tsc 进程均已自然退出，无本任务浏览器运行时。产品、index 与 dist 控制权交回根，等待独立审查；不由作者运行完整 desktop all / mobile attachments 或自行打包。
