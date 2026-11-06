# Android快速画廊首页83独立复核

状态：**PASS / 冻结源码独立定向复核通过，无blocking**。2026-11-06复核产品 `d73e1f30a04ccf578f7df64b2a2b873a18c3d64d`、作者证据 `b74f60d9895d624eeaed1cbad51caa18771ad272`。规格为主线 `docs/ui/android-quick-home.md`，包括来源scope/owner、800断点、手机设置桌面label、same-source receipt恢复、亮黄按钮/隐藏后层操作与冷启noteId为空且不预读媒体的补充。独立未修改产品。

## 组合第二次失败后的手机入口独审

**PASS / 两处局部入口复核通过；最终完整mobile attachments尚待根恢复。** 根attempt02的desktop storage-overview已通过，mobile attachments在前序storage布局矩阵结束于1280px后调用preferences入口，等待 `.mobile-home-settings` 超时。global runtime.reset只重置数据/页面，不恢复viewport；runtime.mobile描述设备边界，不能代表当下响应式布局。原件保存在主线 `docs/verification/mobile-home8283/integration/attempt02/`。

修复 `ec52b69eb5bc636b84704bdc31f1eb250eb3a51d` 仅在preferences手机入口增加4行、quick-home入口增加2行，明确先 `setViewportSize(runtime.viewport)` 再reset。独立核对78src、index.html与global runtime.mjs共80项与d73相同，未改global reset或任何产品源码。

独立最小驱动对两个真实run函数各自构造1280污染→global reset，先证明仍为desktop，再仅执行到首个原业务断言并通过专用sentinel停止，避免整组重跑。实际入口均恢复精确390×844；preferences真实gear/共享settings tab及关闭后gear焦点通过；quick-home冷启all/null/无隐藏editor、真实＋仅一次创建及确切新editor focus通过。**14项自然exit0，完整外层7.535949625秒**，页面错误为空，126项指纹前后均为 `1a7374f011f8d8e89134b6068e4b8e21615a8ea12d2b437999ba7f20fbef4e94`。原HTML、自然进程、前后指纹、逐文件身份及驱动见 [viewport-entry](../../verification/quick-home83-independent/viewport-entry/README.md)。当前仍不宣称完整组合交付通过，根只补最终完整mobile attachments，其他已过组按精确相同产品/相应runner输入映射。

## 组合第一次失败后的最小runner修复独审

**PASS / 定向修复复核通过；组合尚待根恢复，完整交付未宣布通过。** 根首轮82+83组合在 `storage-overview.mjs:596` 的原正向Tab断言失败；原始失败保存在主线 `docs/verification/mobile-home8283/integration/attempt01/`。自然复现trace第二轮实际落other/all，其最后focus栈来自 `DataManagement.back()` 的下一帧来源按钮恢复，说明旧helper仅等待总览DOM挂载便紧接键盘断言，存在导航焦点尚未完成的竞态。

修复 `1ad73a08b52c4b38ec4693872eeda13eba3d6437` 仅给 `scripts/debug/storage-overview.mjs` 的back helper新增8行：记录实际来源，返回后等待真实 `document.activeElement[data-storage-category]` 恢复该来源。保留原正反Tab业务断言，没有sleep，未改产品。独立逐文件SHA核对 **78个src与index.html，共79项** 均与 `d73e1f30` 相同。

独立提取并运行已提交的确切back helper，使用自然浏览器调度器，在all/other/all三次返回后立即执行原Shift+Tab/Tab往返，**11项自然exit0，完整外层6.0548605秒**。页面错误为空，126项当前输入指纹前后均为 `c04c48d484961b22efa6828ca27e5b4fc183ee5d00b0a8a36c5ba4528aa5029b`；相对原83指纹只改变上述runner输入。证据位于 [focus-return](../../verification/quick-home83-independent/focus-return/README.md)。未重复整组storage或attachments，根继续build/production、desktop storage-overview和完整mobile attachments；首轮其他通过结果仅按精确相同产品输入映射复用。

## 初次冻结产品验证结果

独立受控浏览器 **22项自然exit0，完整外层12.493247833秒**；126项输入SHA256运行前后均为 `c4fcc377e3ac0b1bac640e4a29fdc3039cf3e558dff3491ef43f1981611cdfd1`，candidate clean。页面错误为空。驱动、进程自然退出、前后指纹、实际HTML/PNG/几何、全部逐项结果见 [独立证据](../../verification/quick-home83-independent/README.md)。未复制作者45项组或重复完整桌面/附件回归。

- 冷启保留持久selectedNote及桌面view/groupDates，但手机直接all notes、当前noteId为空，无隐藏Tiptap和附件payload读取；手机设置label及真实持久handler有效。
- 同步单飞在首次await之前建立；真实＋和调试create在后端挂起时加入同一请求。root Back阻止成功quit并取消待聚焦，随后仅创建一个实体、不重开editor。
- 创建收据成功而metadata失败时保留真实实体和可恢复错误；同来源再次＋恢复确切收据、没有第二次create。明确切换物理目录后可创建新的owner实体，旧all来源实体保留。
- 延迟metadata期间打开设置并聚焦外观控件，迟到结果保留设置和当前焦点；关闭设置不触发旧focus。源码focus条件校验准确editor所有权、连接、可编辑性、noteId、navigation generation与access gate，无100ms全局querySelector。
- all创建后的真实输入由Done flush，返回all卡片。空结果smart来源保留新建exact editor、物理owner default，格式与合成录音保存均可用且不改变smart membership。
- 320短屏深色检查两列外框阅读顺序、无横溢、唯一标题日期、锁定摘要、隐藏swipe后层、56px白加号亮黄主操作、44px搜索；800切回桌面且未改共享view。

第一次驱动误取卡片内部内容框，锁图标造成内部垂直居中误差，被误判阅读顺序。以外层 `.note-entry` 几何修正后通过；原失败进程、原驱动和完整现场已保留。没有产品修补或隐藏失败。

## 源码与边界

只读检查创建receipt、来源scope/owner、新建授权投影、exact focus/导航取消、root Back未完创建/附件屏障、手机冷启恢复、设置入口与响应式CSS。native/controller未变，以准确SHA映射8项输入至80/81已经验证的 `ad3a069f`，未重复Cargo/AppKit。

本次为实际App/编辑器/保存/录音控制器与合成IPC/media/backend的源码及DOM证明，不代表Rust Store、真实Android IME/provider、原版整窗像素验收。原Android约13秒未保存录音现场、已安装应用、真实麦克风与苹果备忘录均未操作。根的82+83一次组合全回归、双端准确构建、组合截图及独立核包继续在 `docs/verification/mobile-home8283/` 单列；本PASS未把后续事项冒称已完成。
