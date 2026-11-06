# 83快速画廊独立定向验证

2026-11-06，冻结产品 `d73e1f30a04ccf578f7df64b2a2b873a18c3d64d`、作者证据 `b74f60d9895d624eeaed1cbad51caa18771ad272`，独立开发树 `/private/tmp/apple-notes-android-quick-home83`。结果 **PASS，22项，自然 exit 0**。完整外层进程耗时 **12.493247833秒**；驱动内部12.385593084秒。126项输入指纹运行前后均为 `c4fcc377e3ac0b1bac640e4a29fdc3039cf3e558dff3491ef43f1981611cdfd1`，候选源码clean且未修改。

`run-focused.mjs` 是独立驱动，SHA256 `5e7ec40af78b8593c11253c68fc6fb839f55251098e65d8110637e8c6d85ee8f`。仅打开一个受控mobile浏览器runtime，调用真实App处理器、Tiptap、SaveQueue与录音保存链，通过真实HTML、activeElement、几何和后端调用记录判断；边界为隔离合成IPC、存储及固定音频设备。未重跑作者45项组、完整桌面组、完整附件组或布局矩阵。

重点反例包括：持久selectedNote带附件时冷启无editor、无媒体读取；手机派生画廊保留桌面view/groupDates且设置label明确；真实＋与调试create加入同一被挂起请求，root Back不退出、不迟到聚焦；metadata失败后同scope恢复确切收据、不重复创建；换物理来源后新意图正确owner且保留旧实体；在途metadata期间打开设置，迟到结果不能抢设置焦点；空结果智能目录的新建editor仍可用格式与录音，合成音频保存至确切noteId；Done真实输入flush；320短屏深色、800断点、标题日期唯一、隐藏后层swipe、56px亮黄＋、44px搜索和锁定摘要保护。逐项结果见 `final/result.json`，完整外层自然退出见 `final/process.json`。

第一次运行在17项业务断言通过后，阅读顺序测试误用了卡片内部内容框。锁图标导致该框垂直居中相差10px，错误判为同排顺序颠倒。截图、HTML与CSS grid均显示外层顺序正确；驱动改为 `.note-entry` 外框几何后22项通过，产品未变。该次自然exit1、12.765698125秒、原驱动、失败状态/HTML/PNG/metrics和前后相同指纹完整保留在 `attempt01-driver-order/`，未删除失败记录。

所有运行输出先写 `/private/tmp`，HTML扩展为 `.html.txt`，runtime cleanup后再复制至证据目录，避免Vite watcher被证据HTML触发重载。最终runtime已清理并释放index/dist。按根协调，主线暂存的独审资料已在运行结束后移至83树证据提交；驱动与进程记录保留实际运行位置。`frozen-source-identity.json` 以准确提交blob映射8项未变化native/controller输入到80/81已经验证的 `ad3a069f`，未重复Cargo/AppKit。

本结果不证明Rust Store、真实Android IME/provider、实际系统对话框或原版整窗像素一致。未触碰原Android约13秒未保存录音现场、已装应用、真实麦克风或苹果备忘录。根负责82+83组合后一次全量回归、准确双端构建；组合后的截图与独立核包另存 `docs/verification/mobile-home8283/`，不混为本次源码独审结果。


2026-11-06追加：根首轮组合的旧storage-overview正向Tab断言失败后，已对仅8行runner时序修复 `1ad73a08` 独立复核。定向11项自然exit0、完整6.0548605秒，产品78src+index全部与d73逐字节一致，当前126项指纹c04c48d4…aa5029b前后不变。详见 `focus-return/README.md`。初次22PASS仍是其准确冻结输入结果；组合尚待根恢复，不作为完整交付通过。


2026-11-06再次追加：根attempt02在1280px布局矩阵后进入手机preferences时因缺少真实mobile gear超时。对ec52b69e的两处局部入口viewport→reset恢复独审14项自然exit0、完整7.535949625秒，78src+index+global runtime共80项仍与d73相同；详见 `viewport-entry/README.md`。最终完整mobile attachments待根恢复，本证据不代替完整组合交付通过。
