# 验证记录

状态分三类：`pass`=有实际证据支持该具体用例；`fail`=可复现不符合；`unknown`=未测、证据缺失或环境阻塞。功能测试和像素测试独立记账，不能把build成功合并为UI通过。

## 环境与截图要求

每次报告包含：源码commit、产物SHA-256、构建命令、OS/设备/WebView版本、窗口/内容像素与逻辑尺寸、DPR、主题/语言/字体、测试数据、动作序列、预期与实际、截图/日志路径、限制。

### Mac

原版Notes 4.13/macOS26.4，主窗1088×660pt/2×。比较布局用同尺寸克隆窗口。优先使用新的无敏感测试文案。账户组由用户要求改成本地设备，不应把iCloud账户内容复制到克隆；这项明确的范围变化单独描述，不能悄悄遮罩整个侧栏。

当前参考有系统屏幕共享徽章、指针高亮与时间/光标等动态像素。若遮罩，须以具体矩形坐标和原因记录；正文、组件边缘、文字、图标不能整体遮罩。模糊背景受桌面内容影响，采样时须相同背景或专门独立验证材质。

### Android

参考录屏224×480，仅亮色可见，系统版本/源DPR未知。先比较应用内容的比例和相对布局；原视频压缩像素可做低分辨率相似度报告，但不能证明高清字形精确一致。Android状态栏/键盘/系统分享面板需单独记录，因为这些由不同系统绘制。

模拟器可能使用老WebView。记录实际版本并覆盖高度单位、flex gap、结构化克隆、媒体权限、键盘resize。APK安装与真正可操作页面是两个验证点。检测白屏后必须修复并重新截屏，不把启动进程当功能通过。

## 像素结果格式

每个场景保存 original.png、clone.png、overlay.png、diff.png 与 JSON 数值。报告原尺寸与任何重采样规则；输出raw exact mismatch ratio、mean/max channel error。允许辅助感知指标，但不替代原始差异。原图内容不同则只能比较明确定义的公共组件，不应给整个页面一个误导的通过分数。

## 当前事实

- 原视频已保全并抽帧；Mac原版主窗、菜单、画廊、清单与表格均已采集独立测试内容。
- REA原生UI采集因宿主AX权限拒绝；CUA采集正常。用户已手动解锁，已恢复界面对照。
- 克隆真实主窗截图为`references/desktop/clone-list-editor-first.png`；存在标题/图标/侧栏间距差异，不代表像素验收通过。
- Android开发自测发现旧WebView缺少Array.findLast导致编辑事务未触发保存；兼容补全后，独立QA在已安装APK上确认中文、清单、表格经force-stop/冷启动保持。具体范围与限制见`docs/verification/qa-001/README.md`。
- 首轮独立报告`docs/plan/reviews/qa-001-01.md`结论为blocked：基础持久化通过，但归档存在附件损坏问题，功能/菜单/画廊/纸张与像素仍有差异。
- 归档阻塞已由`docs/plan/reviews/app-001-fix-00-02.md`独立关闭：三份非法文档拒绝、63例schema跨检、五组额外合法文档、晚期数据库失败与六次真实进程中断恢复通过。结论仅限FIX-00，不升级为整应用或像素通过。
- F12后续静态审查见`docs/plan/reviews/lock-boundary-static-01.md`：跨窗锁状态与明文缓存失效存在P1缺口，运行复现仍not-run；安排FIX-03修复并独立验收。
- FIX03候选fe10c3a的独立无GUI补审ad9ea3d见`docs/plan/reviews/app-001-fix-03-static-01.md`：Rust25/schema65/access12/editor检查与真实Session/Store独立probe6项通过，但前端hydrate在pending时错误推进保存基线，可能让后续队列隐式覆盖另一窗已确认内容，P1 blocking。该覆盖链静态确认，尚未真窗复现；修复进行中，不将有限后端通过当作整项通过。证据在`qa-fix-03/run-fe10c3a/`，开发与独立运行证据分别保留。
- 上述P1由b5dcfa8修复，633688e独立补审`app-001-fix-03-static-02.md`确认静态覆盖链关闭，16个gate/基线检查与4个真实Rust副本边界检查通过。d9a5be5只添加固定真实登记响应暂停/版本日志，默认入口关闭；正式Mac/APK已恢复默认构建。真窗排队/冲突恢复、时序和同源安装版仍待实际复核，不把静态关闭等同FIX03整项完成。副本已保存但随后同步失败可重复另存的P3单列backlog。
- d9a5be5默认APK（3cb26e23…）安装内流式hash核对后，独立真实Android键入发现`crypto.randomUUID`缺失使新增保存登记失败，P1见`app-001-fix-03-android-01.md`（aa6280a）及`qa-fix-03/android-d9a5be5/`。环境是API30/WebView91，isSecureContext=true、getRandomValues可用；不是已证实的不安全上下文问题。合成pending正文只读保全、主数据未清理；锁定/冷启矩阵尚未到达，待最小UUID兼容修复的新默认包复验。
- 最终生产源码20c3014统一使用安全UUID入口，缺少randomUUID时由getRandomValues生成RFC4122 v4；015d148独立静态与定向检查通过，实际Android旧WebView回归仍由默认新包完成。7031e4a冻结默认Mac（904517fc…）、APK（44b6b16d…）与同源Mac专用包（2fe4ae34…）身份，详见`app-001-fix-03/developer-selfcheck.md`及各identity。d9专用包实际A/B旧基线冲突、副本持久化和晚到读取拒绝日志保存在`proof-mac/final-d9a5be5/`，属于开发证据；不能替代最终20独立真窗验收。默认最终包无proof入口的检查单列于`production-no-proof.json`。
- e5fcdc4的最终Android独立报告`docs/plan/reviews/app-001-fix-03-android-03.md`在同一API30/WebView91上核对源APK/安装base.apk一致后，完成真实新建输入、锁定、错误密码拒绝、正确解锁、追加、关闭锁会话、锁态共享拒绝、PID消失后的冷启动与完整JSON保持、Home/focus/Back共14项有限断言，关闭旧UUID保存P1。证据在`qa-fix-03/android-20c3014/`；使用模拟器而非实体手机，未测中文候选组合/像素/Mac双窗受控时序。成功解锁后残留错密横幅的P3单列backlog。
- 835751d的最终Mac独立报告`docs/plan/reviews/app-001-fix-03-mac-01.md`完成默认20生产双窗Q1/Q7及同源proof的Q8选区/Undo/Redo、早登记A/B冲突/普通retry不覆盖、副本冷保全、Q2排空、Q3abort、Q4同read的access_changed拒绝与漏commit恢复，fresh266条日志/15有限断言通过。CUA同bundleID误选包的一次中断单列排除；可逆路径切换后仅使用新日志，结束已完整恢复904517fc…默认包、核冷启且无proof。证据在`qa-fix-03/mac-20c3014/`。本轮有限安全门槛允许FIX02正式接入；S3非ACK集合旧保存、四fixtureGUI、对象identity、F12/F13全矩阵及像素仍unknown/not-run，不把此门槛升级为整个任务verified。
- FIX-01独立安装版报告见`docs/plan/reviews/app-001-fix-01-01.md`：格式栏IME遮挡、重复附加栏、等宽样式标签和纸张页IME遮挡等本轮P1/P2已关闭；最终源码0d8b245与安装内APK指纹独立核对，纸张真触摸/同选区恢复/继续输入/一次冷启14项断言通过。最终产物清单见`app-001-fix-01-paper/build-manifest.json`，未覆盖矩阵partial/not-run及像素unknown仍保留。
- 初始键盘遮挡实证仍保存在`qa-fix-01/run-08f2776/finding-android-ime.md`、纸张后续发现见`qa-fix-01/run-8124911/finding-paper-ime.md`。DOM点击不证明用户可触达；最后修复由实际原生触摸复验，不以开发者自测代替独立结果。
- 原生扫描插件9340dba已通过2358901模块审查：真实Mac中文/空图OCR、会话边界、Android离线强制构建与随包模型检查通过。Android首次断网运行、真实相机/透视/PDF、宿主复制和主App集成仍unknown，详见`docs/plan/reviews/app-004-scan-plugin-01.md`。
- 后续e6cc378宿主复制补证已独立运行通过。旧Android harness首次断网实测在SessionStore目录校验报错，两fixture均未进入OCR/PDF；原失败报告与tar位于`qa-scan-plugin/host-copy-device-20261103/`并保留。
- ec6b6dc修复可信私有根目录的系统别名后，独立补审`docs/plan/reviews/app-004-scan-plugin-03.md`（dbddf34）实际通过首次断网中文/空白OCR、透视与两页PDF、10项路径边界；导出PDF另由Poppler重渲染独立核对。APK与安装包hash相符，网络已恢复。只关闭正常目录误拒绝P1，证据在`qa-scan-plugin/run-ec6b6dc/`；主App接入、实体相机、无GMS设备、UI像素仍unknown。
- 最终报告由独立verify agent写入；阻塞修复交由develop agent，再复核。
