# 统一设置与数据82

2026-11-06用户要求：侧栏底部更多设置三个点改为设置按钮；设置和数据管理合为同一界面，尤其参考第三图的图标标签，在“设置”“数据”两标签切换。用户三图保全docs/research/preferences82/；图中文字仅参考内容，不是额外功能指令。本规格替代旧settings普通modal与81独立data-management外壳，保留80/81图片预览、空间统计、真实导入导出/权限契约。

## 结构和视觉

```text
主侧栏底部 [齿轮 设置] → 同一设置界面（默认“设置”）
┌───────────────────────────────────────────────┐
│                 “备忘录”设置            关闭 × │
│              [齿轮 设置] [数据库 数据]         │
├───────────────────────────────────────────────┤
│ 设置标签                   数据标签           │
│ 外观        [跟随系统 ▾]    本地总占用/比例条   │
│ 排序方式    [编辑日期 ▾]    分类→文件详情       │
│ 显示方式    [列表 ▾]        返回/刷新/搜索/分页 │
│             ☑ 按日期分组   完整备份导入/导出   │
│ ───────────────────────    位置与采样信息折叠 │
│ 锁定备忘录  [关闭所有已锁定的备忘录]            │
│ 本地保存说明                                 │
└───────────────────────────────────────────────┘
```

采用第三图顶部横排图标+文字标签、选中浅底tile/橙黄icon与文字、细分隔线和下部表单。系统SF/PingFang，白paper、浅灰控件与secondary说明，颜色沿用Notes现有变量：#fff/#f5f5f7/#e5e5ea/#1d1d1f/#86868b/#fcb828，深色继承现有theme，不引入独立色板。桌面标签居中，设置行标签右对齐/控件左对齐，内容宽度受限、按组分隔；数据内容保留81布局但嵌入共同外壳，不出现第二个backdrop/dialog/关闭按钮。桌面建议宽约800~860px、总高受视口约束，公共标题/标签固定，内容区滚动；320/390手机全屏且safe-area适配，短屏同样可关闭和切换。不要绘制假的macOS交通灯。

现有theme/system/light/dark、sort/updated/created/title、view/list/gallery、groupDates以及真实closeLocks动作走既有updateSettings/patch。设置即时保存，不新增数据库字段或提交按钮。参考中iCloud、登录密码/Touch ID、字体滑块、新备忘录样式等没有现成实现的选项不凭空增加；第二图仅样式参考，不实现新密码体系。

## 入口、状态和生命周期

桌面folder-footer齿轮按钮可访问名“设置”，直接打开设置标签；保留手机新建备忘录按钮，手机已有view菜单设置入口改指同一界面。原“数据管理”入口（view菜单/调试data.open/modal.open data）直接打开公共界面的数据标签；原settings入口默认设置。旧app菜单内功能通过已有顶部新建文件夹、数据页备份及设置页到达；调试menu.open app可保留旧兼容菜单，但真实footer不得仍弹更多菜单。不要替换正文/笔记工具条中的更多按钮。

父App拥有开关/选中标签，两个tab的选择不改变note/editor/authority/nativeScope/picker scope，不取消正在录音。公共外壳是.app直接子层，统一contentOverlay覆盖settings与data标签，80 native toolbar退让在整个设置界面始终有效。不新增原生窗口/IPC或改80控制器。关闭后恢复toolbar；切换标签不重建外壳。

数据首次访问才采样；首次挂载后在同一界面内切到设置再返回保留快照、分类、query/page/scroll及正在执行的文件操作/错误/notice。隐藏标签不抢焦点，不对隐藏内容消费按键；隐藏期间accessKey/accessBlocked变化仍同步清敏感内容并阻止旧请求回灌。真实导入prepare/commit后的权限恢复/设置hydrate继续原契约，失败/取消不假报成功，数据无snapshot时备份仍可达，录音中导入导出禁用。

公共外壳统一Escape/Tab trap（包含BODY焦点和系统对话框返回/disabled按钮失焦），只在live/连接/可见时消费，卸载清理；关闭恢复可用原入口focus。tab采用role=tablist/tab/tabpanel、aria-selected/controls，ArrowLeft/Right、Home/End可切换并聚焦，Tab进入当前内容，隐藏内容inert或hidden不可Tab到。数据内部返回仅回总览，不关闭外壳；关闭按钮/外部Android back关闭整个设置界面。选中标签在再次打开时由入口决定，不偷偷复用上次标签。

## 调试与验证

新增settings.open无参（默认设置）、settings.tab {tab: settings|data}，App/catalog/protocol严格校验；app.state附preferences tab/open。既有data.open/refresh/navigate/filter/export与modal.open settings/data保持实际功能可用，必须复用真实handler；data操作在设置tab隐藏时明确拒绝或需要先切data，不允许偷偷操作不可见标签，已有在途操作可自然完成并保留结果。settings.update保留。

新增preferences组覆盖真实齿轮和手机菜单入口、两tab默认/切换/键盘、控件更新和真实保存fixture、数据懒加载与状态保留、隐藏迟到请求/权限切换、备份取消/错误/恢复/活动录音禁用、关闭focus/bodyEscape、原生projection overlay、无数据正文/Undo改写、320/390/800/1280浅深长内容与短屏无横向溢出。保留并适配旧mac-feedback/data79/storage81/image80原断言（只更新真实入口/公共close选择器/几何查询，不删业务检查）。并入桌面all和手机attachments与CLI mobile allowlist。源码冻结后独审，主线build/production/desktop all/mobile notes+recording+attachments一次；双端准确Mac26/Android构建16和精简核包。只用独立合成浏览器与既有本地构建缓存，不操作已装App/真实麦克风/原Android现场；原版整窗像素继续单列。

83手机快速画廊覆盖补充：手机固定画廊与不分日期时，显示方式/日期分组控件明确标为桌面设置（“桌面显示方式”“桌面按日期分组”），真实handler/持久化不变，桌面原label不变。以android-quick-home.md为准，不新造手机设置字段。
