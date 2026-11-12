# Android r2 真机验收（2026-11-09 至 2026-11-10）

本报告只描述实际 Samsung 真机上执行的操作。使用 ADB/系统 UiAutomator，未用页面脚本、WebView 调试或模拟 DOM 替代原生证据。产品源码未在本轮修改。

## 包、设备与保数据升级

- Samsung SM-G9500，Android 9/API 28，arm64，1440×2960/density 640，序列号 `98895a3147304c3132`。
- r2 APK：`artifacts/releases/20261109-modernization101-r2/android/CyberNote-Android-arm64.apk`，38,475,914 B，SHA256 `6d75b1613cd07909de52ecc5c722cd453186c1dd47c3ad63645befb17758adf4`。
- 版本 `0.1.0`/versionCode 1000；前端构建 `2026-11-09T14:47:14.179Z`；437 输入的来源指纹 `1c99f39a70e9a00399e40cd8b298b0531929dd9ed518007a44602875bf5efb7f`。
- 主库 SHA256 `fcfefc12b97c073c2ef3e9873daf1c9ca13be77ccdbcc4b3efdc6f1c022e54fa`；实际库、codegen assets、frontend 与包内来源由父级独立核包。准确入口见同批次 `android.json`。
- 升级前实际已装包签名与候选签名相同：证书 SHA256 `e71ec0b1b626c9e54c7b4a1517ba1c12703d86364c17100658d954a94e6bec79`。随后 `adb install -r` 成功；未卸载、清数据或改用户“解散”笔记。临时拉取的旧 APK 已删除，摘要和证书比较保留。
- 系统设置实读 lastUpdateTime 为 `2026-11-09 23:04:31`。实际设置页显示版本、UTC、revision 与完整相同来源指纹，见 `24-version-source.png`/`24-version.xml`。

以下证据均位于 `artifacts/final101-android-r2/`，图片为直接系统截图，XML 为系统 accessibility 层级。每次输入前检查 CyberNote 在前台。

## 实际核心路径与失败项

| 路径 | 实际操作与观察 | 直接证据 |
| --- | --- | --- |
| 新建输入法 | 点击新建后原 WeType 完整可见，`mInputShown=true`；返回浏览后点击正文再次显示输入法 | `03-new-note-ime-stable.png`、`02-new-note-ime-state.txt`、`20-body-tap-ime.png`、`20-body-tap-ime-state.txt` |
| 格式面板：保持失败 | 打开格式面板成功；随后只执行正文长按，截图08已变为普通工具栏，完整格式面板消失。此时尚未执行任何手动关闭。选字期间保持面板的真机要求未通过；后续拟斜体/关闭点击缺少正确目标证据，不能计为功能通过 | `07-format-stable.png`、`08-format-selection.png`、`06-format-open.xml`、`format-operation-sequence.json` |
| 速绘默认键盘 | 进入速绘没有显示输入法，系统 `mInputShown=false` | `09-drawing-entry.png`、`09-drawing-ime-state.txt` |
| 双指缩放/移动 | 系统 UiAutomator 真正双指注入；缩放前标签60%，后150%；随后两点各平移(+150,+150)且仍150%，图形位置变化 | `r2-zoom-before.png`、`r2-zoom-after.png`、`r2-pan-before.png`、`r2-pan-after.png`、`10-os-pan.log`、`CanvasGesture.java` |
| 速绘背景/保存 | 在速绘内打开纸张菜单，选中网格，完成后笔记内保存了自己一条斜线与网格 | `11-drawing-paper.xml`、`12-drawing-saved.xml`、`16-recording-saved.png` |
| 单击/长按速绘 | 保存后单击即重新进入速绘；取消回笔记；长按弹出编辑、复制、剪切、粘贴、导出SVG、删除菜单 | `18-drawing-single-click.xml`、`18-drawing-reopen.png`、`19-drawing-long-press.xml`/`.png` |
| 实际录音 | 打开录音、开始，红色波形和计时推进；停止、完成，音频作为附件保存回自己的笔记 | `14-recording-active.png`、`15-recording-stopped.png`、`16-recording-saved.xml`/`.png`、`recording-stop-save-14s.mp4` |
| 实际播放 | 点击保存卡的播放，UI变为暂停，时间0:01/0:04，波形进度推进；播放结束恢复播放按钮。卡片波形区域一直保留，未出现旧下方展开播放器 | `17-recording-play.xml`/`.png`、`20-body-tap-ime.xml` |
| 附件画廊 | 通过显示选项→查看附件实际打开，显示4条音频，其中自己刚录音明确归属自己新建笔记；打开自己附件菜单看到了在备忘录中显示/保存/拷贝 | `26-attachment-gallery.xml`/`.png`、`27-own-attachment-menu.xml` |

**2026-11-10 证据复核更正：** 初版报告把格式面板保持与手动关闭误列为通过，现撤回。原始工具记录为15:21:09Z截图07（完整格式面板），15:23:25Z下一次输入仅为正文长按 `swipe 600 670 600 670 800`，立即截图08，之后才有拟斜体 `tap 395 2368` 与拟关闭 `tap 1286 1924`。截图08明确显示选字浮动菜单与普通编辑工具栏，完整格式面板已经消失；两图之间没有手动关闭动作。这是实测失败，不能只解释成文档证据不足。原因尚未定位；未重新操作设备或修改产品。

双指注入使用60步，缩放两点从(600,900)/(840,900)到(420,900)/(1020,900)；平移从(600,1000)/(840,1000)到(750,1150)/(990,1150)。这是 Android OS 的两个触点事件，不是物理手指实测，也不是 Mac 触摸板实测。

新建的唯一自有笔记实际标题为 `IFNAL－1AndroidIMEr`。ADB ASCII输入经 WeType 硬件按键组合后未保留原计划的字面标题，因此报告使用实际显示文本辨识它；没有切换输入法来掩盖该限制。录音被插在该笔记上方。仅此新建笔记被修改，原有3条用户音频只在画廊列表中被只读显示，未播放、编辑或删除。

录音停止保存的14秒系统视频及3fps contact sheet中看到一次保存提示后进入笔记，后续卡片与工具栏稳定，未看到连续整页空白或重复重建的可见现象。这不等价于 React render计数，也不能据 Android 结果确认 Mac 的录音完成刷新问题。初次未激活的保存卡显示“时长未知”和占位波形；激活播放后出现“音频·4秒”和实际进度，属于此次直接观察，应与媒体按需加载行为一起评估。未通过扬声器听感验证音质。

## 设置恢复、内存与范围

原默认输入法 `com.tencent.wetype/.plugin.hld.WxHldService`，enabled IMEs、自动旋转和user_rotation在结束后与开始逐项完全一致，见 `original-device-settings.json`、`final-device-settings.json`、`device-settings-comparison.json`。没有修改主题、字号、界面细节或轮换设置，无需执行回写恢复。设置页只查看和滚动；录音/速绘/格式面板均已关闭。

保存了原样 `memory-home-after-own-recording.txt` 与 `memory-attachment-gallery.txt`。这是一条自有笔记、一个短录音和一个速绘的运行快照；画廊还只读列出原有3条音频。它不是503附件性能基准，没有以此宣称大样本原生内存改善。没有取得单独严格的播放退出瞬时内存快照。

没有进行本轮真机表格转换/拖拽完整矩阵、PNG/SVG/视频/文稿导入、附件跳转执行、复制/粘贴/导出执行、500图片压力、物理双指或 Mac pinch 验证。准备的小媒体文件未导入设备。对应源码与独审覆盖分别见 [会话96](../../plan/reviews/app-editor-session96.md)、[表格95](../../plan/reviews/app-table-interactions95.md)、[丢失mouseup95H](../../plan/reviews/app-table-pointer95h.md)、[媒体UI99](../../plan/reviews/app-media-ui99.md)、[设计100](../../plan/reviews/app-design-rules100-independent.md)，这些是额外源码证据，不替代本报告未测的原生路径。Mac实际范围见 [macOS r2](macos-r2.md)。

清理：临时旧APK和本次系统录屏远端副本/gesture jar已删除，记录 `cleanup-previous-apk.json`、`cleanup-own-device-temporaries.json`。保留最终r2 APK、全部本地实测证据以及自有测试笔记供复查；未删除用户数据。
