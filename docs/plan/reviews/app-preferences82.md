# 统一设置与数据82独立复核

状态：**PASS / SOURCE-READY，无未关闭 blocking**。产品冻结 `8fd3e35f`，作者证据 head `dd1d19fd`；125项输入指纹 `7a7025e49d58a4846ee6a4d984833b88c4723c9043b1859d9611fba3e4ce6ac7` 独立执行前后相同，产品源码clean。主线后续83组合全回归及Mac26/Android16核包另记，本结论不冒充已出包。

## 源码审查

共同Preferences为App直接子层，父App持有开关/活动tab。settings/data旧入口映射同一preferences状态；footer仅替换自己的更多为齿轮，手机新建与正文更多不改。共享壳只有一个dialog/backdrop/关闭按钮；tabs具有role/aria、roving tabindex与左右/Home/End处理。document capture仅live/连接/可见消费Escape/Tab，过滤hidden/inert内容，卸载清理并恢复可用入口；BODY焦点也在闭环内。

首次访问data才挂载，visited后同一实例通过hidden/inert隐藏，切换不卸载、不重新inventory。DataManagement active guard限制新操作，隐藏时仍执行accessKey/accessBlocked布局清理，递增authorityGeneration/request ticket，旧snapshot/错误/notice/filters同步清空；旧inventory只有匹配ticket才能发布。导出文件结果亦以authorityGeneration限制notice/error回灌。后台既有操作不因隐藏取消，完成后不抢焦点。

App contentOverlay在整个preferences两tab持续true。tab不进入nativeScope或picker scope，也不改变note/editor/authority；设置控件使用既有updateSettings/closeLocks处理器。备份复用现onArchive和录音/访问/忙保护，首次采样失败仍保留入口。设置失败走原真实错误banner，不能将乐观控件值当持久成功。旧77/79/80/81 runner diff仅适配真实入口、统一close/几何和新增组注册，业务检查未移除。新增settings.open/settings.tab由catalog/protocol及App严格校验。

native controller、transport与原生/model/harness输入均与已验证 `ad3a069f` 逐字一致，按8项准确SHA映射复用80/81 controller20、AppKit与Rust模型结果，未重复Cargo/AppKit。映射见 `docs/verification/preferences82-independent/frozen-source-identity.json`。

## 独立精准DOM执行

最终 **32项自然exit0**，完整外层 **12.480735s**（内部12.373666s）。真实生产React/App/DOM/录音会话，显式合成backend/媒体/IPC/文件选择器边界；nativeToolbar使用实际App→guest传输投影与模拟Mac IPC。

- 真实Mac齿轮→单个App直接子壳，settings零inventory；真实设置失败未落fixture、重试正确持久化。
- End/Arrow/Tab、首访data懒加载；四个隐藏data.*命令拒绝。snapshot/分类/query/page/scroll、确切壳/body/editor DOM及note/folder/page/authority保持。
- 导出在途双备份disabled，切settings操作仍可用；后台失败不抢焦点、无假成功，回data错误和snapshot保留且可重试；随后取消清旧错误且无成功notice。
- BODY Tab进入统一关闭，ShiftTab仅到可见data summary，BODY Escape关闭且恢复真实Mac齿轮；卸载后document Tab不再被消费。
- data隐藏时access prepare清敏感snapshot/文件DOM，旧inventory迟到不能回灌；commit恢复当前快照，同一data实例/壳保留，native overlay仍true。关闭重开settings重新恢复懒加载生命周期。
- 独立mobile runtime中真实合成录音保持active/recording/owner、starts不重复且stops=0；切tab不取消录音，双备份禁用；Android Back先关preferences，录音仍活动。320×360短屏统一header可达，data真实滚动，无横向溢出。
- 笔记正文未改写，desktop/mobile pageErrors均空。未重复作者52/50整组或完整截图矩阵。

## 原始失败与证据

独立attempt01自然exit1 /17.170247s，12项先过；驱动按原可访问名定位导出busy按钮，而产品真实文本已变“导出中…”，导致isDisabled定位超时。失败HTML明确两个真实按钮均disabled。改用稳定DOM中同一实际按钮，无产品修改。

attempt02自然exit1 /9.027877s，14项先过；驱动在故意失败的data错误态再次调用idle却未接收预期APP_ERROR。产品正确保留“Controlled archive failure”；最终驱动仅在该步骤明确断言该消息后继续验证实际错误DOM/恢复，不改idle算法或产品。两次失败原件和各版驱动均保留，不追认为通过。

[持久证据入口](../../verification/preferences82-independent/README.md)包含最终命令自然退出/完整wall、final/result、前后指纹、Mac恢复data与mobile短屏PNG/HTML文本、native投影和逐文件保全映射，输出仅在runtime关闭后从临时目录保全。未stage/commit，候选index/dist及测试运行权已交还，无遗留进程。未操作原Android未保存录音、已装应用、真实麦克风或原版Notes；不作真实设备/OS选择器/完整WKWebView/原版像素通过结论。
