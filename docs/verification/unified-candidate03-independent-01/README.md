# candidate03 Mac 独立有限运行验收

日期：2026-11-04（Asia/Shanghai）。执行者：verify_app。构建源冻结于 `c6594dbdfe8ee0313205a4b14bcdfeb37b819088`。

结论：**确切 sealed Mac 包身份通过；显式确认搜索焦点后的零结果/清空功能通过；真实文件选择、正文持久化、附件原字节保存和正常退出后冷启动恢复通过。录音停在“正在准备麦克风…”并取消，录音保存/播放未验收。实际打开文本附件的界面操作超时，外部打开结果 UNKNOWN；图片独立打开未执行。本轮没有产生新的原版/克隆有效同条件像素 pair，不宣称像素一致。**

本目录仅包含本次独立运行的合成测试数据、必要界面和只读观察，不修改产品源码、不构建、不操作主 Git。旧版本报告与冻结截图不被本轮结果覆盖。

## 确切包与运行身份

`identity/01-independent-identity.json` 独立重算 232 个输入，聚合 `499805fac0772a9602eb75765278eafb94b888761bdf4efd60338dd64b858470`，当前输入逐项匹配，构建前后清单相等。实际目标为 `/private/tmp/notes-unified-candidate03-mac-sealed.app`。exe 为 15,575,712 B，SHA256 `f11565151c018ae43173b2f2b1d5b223f0e29b2150fc179a34645a74cb0d3c56`；bundle 3 文件聚合 `8abf12dc013b97b7cdf6d3f60d38de9f69543c63c70d64263ee1d4373dfec3cb`；sealed zip SHA256 `800b7fb1b7d904997e997c13a42855b33b1a13bc84f25820da6c096f33e66362`。strict deep codesign exit0，属本地 adhoc 签名，未验收公证或分发。

启动初期曾同时存在旧 candidate02 与新 candidate03 同 bundle id 进程。因此 `mac/01-first.*` 和 `02-search-focused.ax.txt` **不作为确切新包运行状态证明**。纠正后通过正常菜单退出旧包，不再刷新旧绑定以避免自动重启；`03-verified-new-only-first.*` 和 `04-native-search-focus.json` 属仅 candidate03 PID37803 的阶段。随后正常退出、冷启为 PID38987；附件导入后再次正常退出并确认没有 notes-clone 进程，再从相同 sealed 路径冷启为唯一 PID39665（26、28）。没有用旧包替代新包通过。

## 显式搜索焦点下的零结果/清空

03/04 记录新包搜索栏为空。只读原生观察：mainWindow68430，firstResponder `NSTextView`，delegate `NotesUISearchField`，两者值为空；app active、window visible/key/main 均为真，NSWorkspace frontmost 为 com.local.notesclone/PID37803。观察未设置焦点或写入正文。

在已确认的搜索目标上实际粘贴固定不命中查询 `QA-NO-MATCH-20261103-2301-ABCDEFGHIJKLMNOPQRSTUVWXYZ-NEVER-EXISTS-7f62c83e9d4a`。05 显示搜索值正确、标题“搜索”、副标题“无结果”、列表分组“备忘录”；编辑区为空且没有旧正文 AX editor，附件/核对清单/格式/表格/更多/共享禁用。点击实际搜索取消控件后，06 显示搜索清空、原合成 A 正文恢复、工具栏重新启用。

此处通过的是实际零结果/清空功能。候选03没有执行完整 A→唯一B→零→clear 严格 editor/DOM/view 对象身份、selection 连续性或 Undo/Redo 历史补证，不追认旧 candidate02 的严格 F07 结果给本包。已读取的 A 为 `7b67dda1-90ff-4eb1-9a20-d49b94bf2bdc`，revision61，正文 `Alpha Beta Gamma C02-HISTORY VERIFY02-HISTORY`，无本轮搜索串污染。

## 真实文件选择与正文 ACK

07 通过实际新建笔记工具栏和正文输入创建合成笔记 `d3e9a33b-b1b6-455d-a0ed-6dc94bdfb398`，标题 `QA C03 MEDIA 20261104 0327`，初始 revision1。08 为实际 NSOpenPanel。最初两次“前往文件夹/完整路径”尝试（09–11）没有完成实际选择与导入；12 中该笔记仍 revision1 且没有附件。它们保持为未完成尝试，不算成功选择，也不单凭此归因为产品导入失败。

为完成一次实际可见选择，把自有合成 txt/png 原样复制到面板已显示的测试临时目录，19 记录路径、字节数和 SHA256；没有覆盖旧文件。21 保存两个可见文件行实际多选及启用的 Open 按钮。点击该 Open 按钮后，22 显示 txt 卡片和 PNG；23 只读 SQLite 显示笔记 revision3，完整持久化 document 中分别存在文件/图片 attachment 节点，引用 id `17cd1ebd-b415-4c0f-bd02-713ccd969360` 与 `d64a2ff1-3a4d-4033-a44a-ee33165b24e4`。这是实际 picker→正文持久化的 ACK 证据，没有通过 JS/bridge 直接伪造导入。

24 读取该合成笔记的两条附件元数据和 owned blob：

| 文件 | 字节 | owned blob SHA256（等于样本） |
| --- | ---: | --- |
| candidate03-picker-proof.txt | 135 | `a5fe2c86d6617f08e851bd66b0c107ce5a4dcc995e8c3e19edcfa9c92a908463` |
| candidate03-picker-proof.png | 3189 | `730af5964b43bb009d97bcc523963f508c4e02372a6ed9a6d82e49397dd1d6d0` |

两条 attachment_operations 实际 state 为 `stored`，报告不虚称状态为 `committed`。正文 revision3 的 attachment 引用是已落地正文的直接依据。没有导出完整私人数据库。

## 正常退出、冷启动与实际打开边界

第一次 17/18/20 验证的是录音取消后、导入前的文本恢复，不能覆盖后加的附件。附件 ACK 后再次从实际应用菜单 Quit；25 的受限 pgrep 无法读取进程表，仅是环境限制；26 使用获必要权限的只读 ps 明确没有 notes-clone 进程。随后从同一 sealed 路径重新打开，28 记录唯一 PID39665。27 实际 AX/PNG 中 txt 卡片、PNG、合成正文均恢复；28 完整笔记仍 revision3，两个 owned blob 长度和 SHA256 与24相等。**此有限附件本地保存及正常冷启动恢复通过。**

之后对 27 中新鲜 AX35 文本附件做实际点击并请求当前 AX/PNG，CUA 15.0229 秒后超时并重置 kernel，没有生成成功后图。一次 inventory 返回应用列表，没有明确附件打开结果；随后仅一次绑定已知 sealed 路径也于15.0165秒超时。29 保留具体工具结果。按有界策略停止，不重复点击、不绑定未知外部应用。

因此文本附件外部打开/保存结果为 **UNKNOWN**；图片单独打开/view 为 **NOT EXECUTED**。已呈现 PNG 与已核对原字节，不等于已完成系统图片查看流程。超时也不能单凭此推断 app crash、数据丢失或打开成功。

## 录音有限实测与阻塞

13 为真实附件菜单进入的新录音面板：00:00.00，开始录音启用、完成禁用。点击真实开始录音后，14/15 持续可见“正在准备麦克风…”，时间仍00:00.00，暂停与完成不可用。本次 inventory 观察没有提供可操作的系统麦克风授权窗口；没有证据足以断言全局不存在提示或明确拒绝权限。16 通过实际取消关闭准备中的录音面板，正文及工具栏恢复。

未取得实际 getUserMedia promise settlement、stream 状态或录音文件，所以原因 **UNKNOWN**。没有使用 mock、静音音频或旧录音代替。sealed Info.plist 中麦克风 usage description 已由 native/root核对存在，不归因于缺少说明；root另以获必要权限的只读系统设备枚举见默认麦克风/扬声器，受限环境空列表不作为硬件缺失证据。

录音保存、录音正文 ACK、冷启动后播放、实际可听性均 **NOT EXECUTED / BLOCKED 于 preparing**。取消恢复本身可确认，但不能覆盖未完成录音链路。

## 像素与交还状态

本轮未再操作原版 Notes，也没有取得原版与本候选03的有效相同状态/几何截图 pair，没有新像素指标。不把旧包像素结果、本轮局部功能通过或空白区域近似当作全界面像素通过。此前独立像素 FAIL 与原版搜索恢复/激活限制保留各自原始报告。

最后有完整可读状态的候选03为 PID39665（27/28）。之后文本附件点击后的 CUA 路径超时，kernel 已重置；当前前台窗口/弹窗状态未知。未操作 Dock、未知外部 app 或原版正文，未更改系统权限或设备，未清空应用数据。Android 本轮未安装/输入，不纳入这份 Mac 报告。主 Git 与提交交给 root。
