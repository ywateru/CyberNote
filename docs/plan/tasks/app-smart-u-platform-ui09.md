---
id: app-smart-u-platform-ui09
scope: Real Mac and Android smart folder forms and navigation
status: pending
depends-on: [app-smart-o-metadata09]
---

## Objective and context

将D2/O真实能力接入两端创建/编辑/浏览，不用静态表单或localStorage替代Rust持久化。读取requirements F17、architecture、ui/smart-folders-macos.md、ui/smart-folders-mobile.md、ui/local-features.md、D2与O任务。最终目标仍为完整本地规则和原版一致；本轮数据已支持的标签/置顶规则须真实可用，未支持类型不得伪保存。文件夹引用规则/删除原版实测用户暂缓，另批闭合，不将工程政策冒称原版。

## Shared integration

Folder在TS边界为严格物理/智能联合类型；查询闭合schema、Rust/TS合法facts与真值表共用固定corpus对照。读取真实SmartProjection或同一严格查询投影，列表、数量、首篇选择消费同一结果；不分别写三个folderId过滤器。pending正文可通过已有可信快照参与乐观投影，但最终保存ACK仍权威；不能扫描纯文本#猜标签。包含smart的旧UI临时gate仅在真实导航/表单/候选/选择全部接通并通过门禁后统一移除，保留未知版本/非法实体错误。

新建/编辑草稿独立于已保存定义，取消不写；新建默认标签/allSelected空选择，Mac点好后警告并保留草稿，至少一标签才提交。真实保存成功才关闭；失败保留草稿，CAS冲突不能覆盖新定义，明确刷新/保留本草稿供处理。已有定义重开填当前名称/组合/规则；标签名称可暂时无引用。重命名/删除走同定义CAS，普通renameFolder不能旁路。最终删除交互待原版实证；当前工程删除若开放，只能删定义，不移走成员。

## Navigation and editor owner

智能结果是视图，note.folderId始终物理；新建转default并更新当前物理上下文，不自动置顶/加标签。移动、父目录目标不能选择smart/trash/all，规则候选以后单独定义。选智能目录按真实排序首篇/空状态，侧栏及手机文件夹页用真实智能图标和数量。新建/改名/编辑/查询结果更新不能清当前保存队列或重挂Editor。结果末项移出、全空、删除当前定义和搜索取消的选择须明确动作表，已证的原版事实与工程决定分开；不把原版“取消唯一置顶转物理源”外推所有正文失配。活动组字停车复用现标签边界，访问失效仍立即遮挡。

顶部搜索仍全账户，取消恢复原智能上下文；运行时别窗定义更新不强制切换本窗笔记。当前定义被删后转default或原合法物理源须先保全未ACK正文，不能把smartId写为保存owner。冷启/归档选中状态重新验证，未知selectedFolder按原恢复策略，不默默隐藏实体。

### Engineering action table

以下为root批准的防丢与导航实现约定；只有标明“已见”的行为属于原版实际依据，其余须在后续原版对照时校正。基础note owner和保存队列始终属于原note；“首篇”指同一投影按现排序后的首篇，不另写folderId筛选。投影显示其他结果不隐式将旧队列转给新note，也不主动转移键盘焦点。

| 触发 | 视图与结果选择 | 原编辑所有权 |
| --- | --- | --- |
| 用户显式选智能目录；新建定义保存成功后进入 | 进入该smartId，首篇或空编辑区；取消/失败不导航、不提交草稿 | 旧note未ACK正文及已有Editor按现停车机制保留 |
| 当前定义编辑成功 | 保留smartId；原选中仍匹配则保留，否则显示首篇/空结果 | 不更改原note的队列和revision；真实活动组字先按现保留边界完成 |
| 别窗定义/笔记facts通知 | 不写本窗folderId、基础noteId或搜索草稿；可见结果消费最新真实投影，原偏好选择失配时投影首篇/空结果 | 原owner停车，不能以新metadata为由重挂或重基线；不触发自动聚焦 |
| 正文标签编辑导致失配 | 列表/count立即保持真实；本次活动组字暂留原编辑目标，真实结束后按投影首篇/空结果停车 | 保存继续归原note，不虚增结果以留住Editor |
| 仅置顶包含定义中，用户取消唯一匹配笔记置顶 | 转到该笔记原合法物理目录、保留该note；这是原版已见的特定路径 | note owner原本就是该物理目录，不执行移动；其他查询失配不外推此政策 |
| 智能视图新建笔记 | 转default建立普通note，不自动加标签/置顶；这是原版本账户已见路径 | Rust返回唯一新ID后读权威数据激活；成功收据已存在时不重复创建 |
| 搜索与取消 | 搜索全账户；取消恢复进入搜索前smartId及仍合法偏好，失配则投影首篇/空结果 | 搜索结果与基础owner分别停车，搜索不改物理位置 |
| 当前定义被本窗或别窗删除 | 若原基础note仍live且其物理目录合法，转原物理源并保留该note；否则转default | 先保全原pending，不flush失败后强制清空；定义删除不锁/删除匹配成员 |

手机上层名称草稿和过滤面板共用同一个未提交定义。暂定×取消本次过滤面板修改并回上层，黄色勾验证后合并到上层草稿，上层最终确认才调用Rust；系统Back沿取消路径，重复点击不能重复提交。该名称上层/确认链是工程约定，官方静态图没有证明它与手机原版一致，须保留未验标记。Mac模式草稿token缓存不改变持久schema。

### Draft and capability decisions

以下也是工程决定，不补写成原版事实：草稿行允许暂时不完整，严格持久schema不接受的状态只留在草稿。Mac“+”按已见样本新增标签/所有已选/空选择行；重复类型不静默合并，也不改成默认置顶以绕开验证，最终提交遵守D2同类型至多一条的契约，清楚保留草稿并指出冲突。后续原版重复类型政策补证若不同，单列契约修订。

标签输入从真实可见标签目录提供候选，已选token与自由输入区分；新名称经过既有validTagName校验才能变成已选token。选了暂时无笔记引用的名称属于定义配置，不假造笔记标签、成员或独立全局标签表。anyTag/noTags持久值不携带names，切回selected模式可恢复本次草稿缓存。保存期间保留草稿并阻止重复提交；有唯一创建收据时先按该ID同步，不再新建定义。CAS冲突明确保留当前草稿并提供读取新定义的恢复动作，不自动覆盖。

Mac当前已保存定义改名也必须读取并提交expectedDefinitionRevision，不借普通renameFolder旁路。智能定义删除只调用专属CAS删除，不能复用物理删除确认中的“成员移到最近删除”文案或走物理屏障；其原版完整确认外观仍未证。用户暂停的只是原版删除联动实验，本文没有批准任何原版删除操作。

## Platform UI

Mac按已采表单和菜单结构：新建切换制作智能、默认标签行、全部/任意、每行模式及token、单行禁移除、底部取消/好、空标签警告。编辑表单去掉新建checkbox/说明并恢复定义；焦点/菜单/输入法和窗口缩放保全。原版JPEG仅是对照，不标成无损零差，尺寸/颜色须测量后校准。

表单校准补充：`research/smart-folder-form-measurements09/`提供独立近景原图坐标与局部标注，`research/smart-folder-tag-picker-runtime10/`有CUA真实候选、token及allSelected→anyTag→allSelected保留值的草稿往返。原图40px边距、48px控件高等不可原样当CSS px；先在同捕获范围的新包图中校准。候选中的“创建新标签”仅已见入口未点击，不能宣称原版已验证持久化。anyTag/noTags提交不携带names，但可在草稿层缓存selected值，切回恢复；AX disabled隐藏输入不能渲染成可见禁用框。

手机过滤管理使用官方iOS26静态参考中的面板层级、顶部×/黄色勾、启用/其他分组、标签胶囊与类型行，文案保留手机“任何已选标签”等差异；不能复用Mac行增减样式。名称上层、关闭/确认是否保存等未获手机运行证据的部分必须先落工程动作约定，后续实机补证，不能称原版已通过。Back/键盘/安全区接现真实平台路径。用户原录屏覆盖的文件夹页优先沿该录屏，官方新图不作为替换旧已验界面的理由。

手机原图局部校准见`research/mobile-smart-folder-form-measurements10.md`：带硬件640px参考宽中的卡片x48..592、确认圆面64px、单行约76–77px、卡片间26px、标签胶囊约50px/排距62px；只属该参考尺度，先明确内容裁切再换算，不能原样当CSS/dp。未支持的协作/规则内容不为仿样本而伪造状态。

## Verification and delivery

真实App挂载+真实Rust/Session穿入口验证：建标签与置顶定义、取消不变、改规则列表/count同步、CAS旧稿、同Editor/Undo与中文组字保全、搜索进入/取消、新建物理去向、移动目标、零结果、归档/冷启恢复。两端准确冻结源构建，root Computer Use实际操作Mac，已授权ADB验证Android；保留现有数据，不卸载/清库。根用户当前暂缓原版删除实验，不开展删除联动。必要合成测试直接走临时Store不操作真实用户库。

像素验收必须同内容/视口/主题，原版和克隆各保存实际截图及差异，明确JPEG/低清/系统UI限制，不以样式截图替代交互/存储。未支持的本地规则、未证手机状态及像素偏差持续列入未完成，不提前关闭F17或总体目标。作者STOP、固定commit、不同作者独审，再正式构建与有限设备验收；root明确START后才实施。

## Path and execution boundary

允许`src/App.tsx`、`src/bridge.ts`、`src/types.ts`、`src/style.css`及必要的智能实体解析/求值/草稿/两端表单小模块与专用样式；Rust允许`src-tauri/src/{store.rs,session.rs,lib.rs,store/smart.rs,session/metadata.rs}`中的真实动作/查询接入和临时legacy能力gate移除，归档仅将既有严格智能格式接到已适配UI，不重写迁移/归档事务。可新增真实接入测试、共享corpus与`docs/verification/app-smart-u-platform-ui09/`。保留O提交收据/访问屏障/被动刷新契约，禁止修改Editor、录音/OCR/绘画插件协议或顺带修复其他模块。

依赖与生产lock保持不变，无下载/升级/清缓存。检查保持locked/offline、jobs2、至少2GiB、共享host target独占及每条600秒有界；真实Store/Session窄回归、实际挂载App/bridge和两端布局的受控检查、pnpm typecheck/build以及触及lib后的必要一次宿主cargo check允许。作者阶段无GUI/ADB/用户库/正式平台包；源码独审通过后root另行派发准确双端构建并用Computer Use/已授权ADB验收。所有失败与旧证据保留，不能覆盖上批记录。
