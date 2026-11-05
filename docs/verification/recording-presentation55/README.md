# 录音浮窗 / 当前窗口展开：55 作者源码与受控证据

日期：2026-11-05。最终产品源码 **`c518aa7d9748a2dda59c51e225d3b26ac04c1b20`**，基于`86de89d`。本目录仅记录作者侧源码与受控结果；准确双端包、真实Mac/手机运行、有效可听音轨和Apple原图像素验收由根任务另行进行。不能用本目录的PASS替代这些验收。

## 固定源码

| 提交 | 内容 |
| --- | --- |
| `8ccc9347e1da06e65238e9b95e7554c30a68a51f` | 初始产品/新检查：共享纯View、唯一child controller、真实状态投影、订阅Dock、带身份的原生可见性与模式握手。 |
| `50225bc2ca502c6ec44587feb5e03c6d5eeeeb83` | 仅旧App检查：普通关闭允许并核对唯一`presentation-result mode=float`，仍不允许任何capture/submit/cancel消息。 |
| `6c3a5d079e8ae124db31f0131858e49d8b6163fd` | 仅旧组件检查：等待实际Panel时钟渲染后触发一次受控0ms投影，适配10Hz状态传送。 |
| `c518aa7d9748a2dda59c51e225d3b26ac04c1b20` | Dock接收当前原生toolbar reservedTop，标题留在原生工具栏下方；新检查验证44px保留区。旧组件检查补begin、暂停准备及pending-play后的0ms真实投影刷新，原断言保持。 |

具体产品、检查及未修改Session字节SHA见[manifest.json](manifest.json)。`recording-session.ts`、麦克风预检插件、数据库和附件journal没有改动；原始用户图像和手机录屏没有重采或改写。

## 实现范围

`RecordingView`只读取投影和发送typed动作，不创建Session、Audio、URL或音频File。`RecordingPanel`始终在最初的recording child内挂载，保留原Session、采集流、预览播放器、时钟、波形历史和最终File。Owner中的Dock只订阅经过完整session/operation/owner/child认证的真实状态。

状态传送最多10Hz，每份带单调sequence、实际phase/首次时间/累计活动时间、媒体确认的位置、实际seekable范围、播放/准备/错误/动作可用性和最多1800个真实幅值点。数值、时间顺序、点数、范围与未知动作/消息按边界验证；没有把音频字节交给Dock。

浮→展开时先恢复原owner并挂载Dock，等待最新同会话、同切换代次的React layout ACK，再隐藏child。展开→浮时先原生show/unminimize/focus成功，再卸载Dock。切换串行并淘汰过期请求；失败保留原可操作视图。正常关闭展开的owner先恢复child，再隐藏owner；显示失败时保留owner。所有完成/关闭继续走原始A的附件操作和真实文档ACK。

Rust可见性只走现有专用`recording_window_message`的认证分支：真实调用方必须是原owner，只能show原owner，或show/hide固定child。Quit取消保留已展开child的隐藏状态；异常owner丢失会恢复child可见。没有新增泛用跨窗权限或可指定任意label的窗口控制。

手机沿用同一纯View的原sheet布局，没有浮窗/展开菜单，没有听写入口。

## 准确最终检查

浏览器严格串行；使用已有本机Chrome/Playwright和现有依赖，没有下载依赖或清理缓存/worktree。控制硬件、媒体事件和窗口调用，不使用真实麦克风/用户Notes数据。

| 检查 | 结果 | 证据与边界 |
| --- | --- | --- |
| 实际`RecordingView`/`RecordingDock`/`RecordingWindow`/`Panel`/`Session`/`Owner` | 8组PASS | [结果](components-c518aa7/result.json)、[执行](components-c518aa7/execution.json)。默认float、准备中切换、录制反复切换、同一Audio持续试听、seek前后媒体实际确认、非法/过期身份与状态/点/范围、失败与过期ACK、正常owner关闭顺序、保存等待同一File、错误与prestart cancel。受控Dock为280px，绘制验证44px原生顶栏空间。 |
| 实际Panel/Session/播放及ProseMirror widget，包含手机sheet | 12组PASS | [结果](panel-mobile-c518aa7/result.json)、[执行](panel-mobile-c518aa7/execution.json)。桌面/手机seek与±15、pending play禁止Continue、结束重播等待seek确认、关闭/Back/卡片结束、真实编辑Undo/Redo与波形有界。 |
| 原App中实际提取的owner/原始目标/提交/保存队列闭包与真实PM | 38组PASS | [输出](app-owner-c518aa7/stdout.log)、[执行](app-owner-c518aa7/execution.json)。不是挂载完整React App；验证原始A在编辑/Undo/Redo/切B后只插入一次，B文字与焦点不被切走，错误保留同File/operation，实际文档ACK、Quit冻结和迟到ACK等原安全链。 |
| Rust录音注册/路由与纯认证边界 | 5项PASS | [输出](native/stdout.log)、[执行](native/execution.json)。构建自8ccc934；最终c518aa7的该Rust文件SHA相同，见manifest。原owner可见性权限、错误session/op/caller/label、owner丢失/child destroyed、迟到真实ACK与Quit参与者安全。不是实际OS窗口显示验收。 |
| TypeScript + Vite产品构建 | PASS | [输出](build-c518aa7/stdout.log)、[错误输出](build-c518aa7/stderr.log)、[执行](build-c518aa7/execution.json)。保留原有大chunk提示。没有打包双端应用。 |

最终截图：[展开录制](components-c518aa7/docked-recording.png)、[展开且媒体确认的试听位置](components-c518aa7/docked-preview-confirmed.png)、[手机实际共享sheet](panel-mobile-c518aa7/mobile-seek-paused.png)。截图里的owner内容为受控fixture，不是完整产品主窗口，更不是Apple像素差异报告。

## 保留的失败和中间结果

- `preflight-attempt01`：fixture文档路由误匹配自己的模块，未到产品检查；修正文档路径匹配。
- `preflight-attempt02`：前三组实际组件检查已过；过期消息fixture还把elapsed设成小于已有样本时间的非法状态，产品正确拒绝；改成合法但过期的notice状态，不放宽产品校验。
- `preflight-attempt03`：初始8组已过，但早于最终呈现回执代次和原生恢复细化。最终应读取`components-c518aa7`。
- `app-owner`：准确初始源码下，普通关闭新增float呈现确认消息，旧检查把任何消息都判失败。`50225bc`改为明确核对唯一float确认；`app-owner-c518aa7`38组通过。
- `panel-mobile-regression`：旧固定时钟测试只推进一次，10Hz投影采到上一次React确认状态；在读取卡片前增加下一次真实投影。
- `panel-mobile-final`：前5组通过，包括手机seek。另一个旧fixture路径没有推进任何100ms timer，因此live card尚未出现；在begin/暂停准备/pending play后补受控0ms投影，原可用性、数据、时间断言没有删减。最终`panel-mobile-c518aa7`12组通过。

中间目录的失败、原日志与截图保留，不覆盖或改成PASS。所有实际运行的原始stdout/stderr及exit信息保留在各执行目录。

## 明确尚待验收

原生两真实窗口的显示/激活、Mac后台采集、WebKit跨窗按钮触发Start/播放的用户手势限制、真实编码/可听内容、Android准确包与设备回归，以及Apple原图同尺寸像素比较，均不在本次受控证据覆盖范围。尤其不能从fake媒体事件或受控Blob推导录音有效、可听或原生麦克风已获授权。根任务继续负责这些实际包/设备证据。
