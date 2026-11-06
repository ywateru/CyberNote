# Android快速画廊首页83独立复核

状态：**PREPARED / 等待82合入及83开发冻结，尚未执行候选验证，不作通过结论**。规格为主线 `96da3a13` 的 `docs/ui/android-quick-home.md`、`docs/plan/tasks/app-android-quick-home83.md` 与保全三图说明。仅只读主线 App 导航/创建/编辑器/IME/调试边界；未修改产品或运行候选页面。

## 高风险边界及待明确契约

- 创建基线在 `await flush` 前没有同步单飞，成功后使用100ms `document.querySelector('.tiptap')`。重构需在第一异步点前取得唯一创建所有权，以 receipt createdId、导航 generation、当前 exact editor 与授权判定聚焦；后续导航/关闭/选择其他note后迟到结果不得抢焦点。metadata失败只恢复已创建实体，不重复 create。
- 从全部画廊＋时实际物理owner通常为default；基线随后 `setFolderId(fid)`。根已在规格 `bc988e8f` 明确来源scope：all返回all、物理目录返回物理目录、smart实际存default但返回来源smart（新笔记不合查询可不出现）；新建清query/type/tag临时过滤。冻结后以此核验，不把存储owner当返回来源。
- `restoreSelection` 只在首次可信初始化执行；手机初始all应该只改该初始化导航，不使每次metadata/access/导入hydrate重置当前scope。手机派生gallery不写共享settings.view/groupDates，也不破坏桌面原偏好。
- Back基线以folders为root且只flush文档队列后exit；新root层次需重排并保留overlay/menu/search/IME/录音优先级。在途创建、附件与活动录音未必表现为pendingDocs，不得因此绕过保存/退出屏障；根规格 `bc988e8f` 已明确该约束。
- `mobile` 基线为width<700且separate除外；根规格 `bc988e8f` 已明确800px是断点切桌面验证，不能把mobile browser UA当作App手机布局证据。
- 真实Android `NotesKeyboard.show` 自带native延迟，MainActivity已消费IME/system inset；浏览器只证明exact activeElement/selection与bridge调用，不证明实际IME。JS不得重复减native已处理的键盘高度。
- 同时存在folders footer、notes footer和editor tools等多个新建入口；首页唯一主操作及编辑器去重复按钮需连同可访问树/Tab可达性验证。派生卡片不能保留旧gallery-preview与row-content的重复标题/日期，不批量读payload、不泄露锁定正文。

## 冻结后精准核验

真实＋点击→单次action receipt→metadata/access→exact Tiptap focus→输入/flush/重载；创建失败、双击、迟到metadata、导航竞态；初始化/文件夹/搜索/Back/root退出；锁定保护、录音owner与82共享设置入口、附件/图片预览可达；320/390/430及800断点、短屏浅深、按钮避让和DOM阅读顺序。全量旧组和准确双端包由根统一顺序执行，不在准备期重复运行。

未stage或操作候选index/dist、原Android未保存录音、已装应用或真实麦克风。真实Android IME/provider与原版整窗像素继续单列。
