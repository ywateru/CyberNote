# Mac 零搜索结果：同几何旧版本基线，有界收束

结论：同几何设置成功；原版零结果原图有效；克隆未取得同态零结果图，配对像素验收 UNKNOWN / NOT EXECUTED。没有计算差分分数，不能将本目录解释为像素通过或产品零结果失败。原版查询恢复未完成，克隆系统回还尺寸有 1 pt 偏差，均保留原始证据。

## 身份与边界

- 原版 Notes PID 696、主窗口 1599；克隆 PID 23532、主窗口 68273。
- 运行的是旧 sealed candidate02：`/private/tmp/notes-f07-audio-mac-candidate02-sealed.app`；可执行文件 15,534,288 B，SHA-256 `5e948ad9647a0ff878471dc213b327ca88628608b877b1f38c1ce6d154171e79`，源 `fabafcf9723e400c67fd842f870dad9d4ae79d19`。本目录不验收后续 candidate03 或 search-zero 源码。
- 所有界面操作经 CUA；窗口测量经只读 CGWindowListCopyWindowInfo；12 为一次临时只读 REA 观察，无 hooks、无页面 globals 写入、无 UI 或编辑器 mutation。cleanup_error=null；provider 返回的 running 不能作为仍附着的证明。
- 本目录为新证据，旧 frozen candidate02 验证目录未修改。未进行源码修改、Rust 构建、Android 操作或镜像恢复。

## 已完成事实

1. 起点原版 1392×903 @ (48,29)，克隆 1088×660 @ (200,90)，逻辑坐标、2×比例（03）。原版位于“Notes Clone UI 对照”安全对照内容，克隆为 QA A。
2. 一次拖动未改变窗口（04/05）。随后经克隆 Window → Fill，双方实际 WindowServer frame 同为 1392×903 @ (48,29)（06/07）。不再尝试几何调整。
3. 隐藏克隆，在原版显式搜索框焦点确认后粘贴固定零匹配查询；08 的 AX 明确“搜索 – 无结果”、列表头“备忘录”、正文空白、相关工具禁用，原图 2784×1806。09 同时证明原版 onscreen、克隆非 onscreen、frame 相同。
4. 切换克隆后，搜索 click 的一次 AX 曾报告字段焦点，但 paste 后 AX 实际仍为空搜索、A 正文未变，最终 focused window。因此 **10-clone-zero.ax.txt/png 名称有误导性：它们是失败输入尝试的 A 页面，不是零结果图**。原始文件按原名保留，不能拿它与 08 计算零结果差分。
5. 11 证明克隆 onscreen=true、原版非 onscreen，否定“克隆仍隐藏”这一先前猜想。12 随后只读观察到 clone application active=1、hidden=0、主窗口 key/main=1、firstResponder=TaoWindow，但 NSWorkspace frontmost 为 com.openai.codex（PID 94949）。DOM activeElement=BODY、editor selection anchor=head=73、正文正确。这些是同时返回的不同原生指标，不能合并为“搜索已稳定获得键盘输入”的结论。输入未生效的具体原因 UNKNOWN。
6. 唯一后续 Dock 读取 `cua.getApp('com.apple.dock')` 没有返回 AX，被中断时工具报告 `aborted by user after 1243.2s`，尽管请求 timeout_ms=15000；没有执行 Dock tile 点击或后续 paste。中断后 CUA 绑定丢失，一次 sgClone 读取只返回 not defined、无 UI mutation；重新绑定两个已知应用路径均在 0.3s 内返回。

固定查询：`QA-NO-MATCH-20261103-2301-ABCDEFGHIJKLMNOPQRSTUVWXYZ-NEVER-EXISTS-7f62c83e9d4a`。

## 恢复与剩余现场

- 克隆经 Window → Move & Resize → Return to Previous Size 执行系统恢复（13）。15 的最终实际 frame 为 **1089×661 @ (199,90)**，并非起点的1088×660 @ (200,90)，存在系统回还的1 pt差异；未猜坐标修正。搜索为空，A 正文保持，16 只读 SQLite 精确 synthetic A 行仍 revision=61、正确文档，没有此次操作的正文写入证据。
- 原版重新绑定后搜索/取消均 disabled；Raise 后成为 onscreen，但取消仍 disabled，一次点安全对照文件夹未生效。只读取 Window 菜单，未选其他备忘录窗口，随后通过菜单 Cancel 关闭（14）。**原版零查询仍保留，未恢复到每日 TODO，恢复不完整**。15 原版 frame 仍 1392×903 @ (48,29)、onscreen=true。没有对原版正文写入。
- 停止旧包探索。原版的临时搜索可在后续可稳定操控时清除，不把本次恢复尝试当作成功。

## 像素验收限制与后续复验前置条件

没有合法同态配对，因此没有 ROI、overlay、absdiff 或“改变像素百分比”。旧目录中的不同尺寸局部指标也不能代替本目录的同几何测量。

下一新包复验可以复用 08 原图作为历史原版参考；正式计算前仍需重新确认原版/克隆的同 frame、比例、实际可见/输入焦点、原版查询与零态均匹配。必须保留语言、主题、光标、focus、窗口激活造成的真实差异，不能平移优化、缩放或掩盖差异。12 仅证实旧克隆 appearance=Aqua；没有证明原版/克隆所有颜色、强调色或语言设置相同。

预期复验输入路径：新 sealed app 及其 manifest 由 root 交付；真实附件 picker 采用新建无敏感小 txt/png，分别观察正文 ACK 与冷启动；真实录音与旧静音占位记录分开，旧文件不作为“可听录音”证明。Android native / ADB 授权未决时不操作镜像。

目录中的截图、AX 与各次 JSON 均原始留存；17 记录当前旧包 SHA 与全部 PNG 实际尺寸。manifest.json 自身不计入其 files 列表。
