# MEDIA105：原169/450覆盖缺口的有界只读研究

2026-11-10。结论：原99M的281张raster没有后端acquire是可复算事实，**不能把281全部称为已证实的前端撤队，也不能排除产品可见项问题**。旧协议进行了连续坐标的快速下/上滚动，但没有逐卡访问、排队、撤队或最终解码轨迹。现有证据足以定位观测缺口和可信机制，不能补造完整因果。105需要对旧baseline与104后after采用同一完整访问协议；原99M报告保持不变。

本轮只读已有源码/小型原始日志并纯复算；未启动浏览器、构建、benchmark、设备或新增fixture副本。104正在不同代理独审，本研究不触104树。

## 原始证据与复算

原始目录是root `artifacts/media99m-after-run1`、`artifacts/media99-baseline-run4`，冻结映射是`artifacts/media99-fixture/store-map.json`。历史delivery路径现有symlink指向相同文件。此次读取的是现有raw，未重跑旧报告工具、未重写raw。小型复算结果和500个图像的逐ID对照在[media-coverage105-evidence.json](media-coverage105-evidence.json)，其中保留输入SHA/bytes、sampleIndex、原件映射、申请/HTTP计数；未观察的字段使用null。

| 观察层 | 原99M after可证明事实 | 不能推出的结论 |
|---|---|---|
| DOM整体 | gallery几何记录502卡，宽1227/高890，scrollHeight37230；500图像+2视频符合photos类别 | 没有逐ID DOM快照，不能据502总数证明每个ID都实际进入视口 |
| 后端申请 | raster351次全部成功，169唯一ID；PNG46/100，JPEG123/350 | 成功grant不等于URL已发布给img，也不等于解码完成 |
| 无申请 | raster281/450没有后端acquire；500图像逐项对照可列出准确ID | 缺少enqueue/retire记录，不能将每项原因指定为离屏撤队 |
| 实际HTTP | raster108个已关联HTTP事件，73唯一ID；107个200完成、1个200后取消 | 其余96个获grant的ID没有可关联HTTP，不证明它们渲染过；不能把这96全定性为bug或撤权 |
| 解码 | gallery-open及两轮滚动末均10个img节点/5loaded/5visibleLoaded | 其余5节点是否为图片、是否可见、哪项失败都没有逐项记录；73个HTTP ID也不能等同73个已解码ID |
| SVG | 50/50唯一ID有acquire，213次均unsupported_media，无原件fallback | 不能将SVG快速失败降低的排队/解码成本当成104后完整500图等功能负载 |
| 旧baseline | 同映射500图像都有成功原件read_attachment记录 | 原件已读同样不是逐项可见解码证据；不能补称旧baseline已满足新105的每卡terminal协议 |

后端记录来自`media.jsonl`，HTTP来自`network.json`。授予URL到HTTP的关联使用既有capability映射；没有可关联事件即报告“无可关联HTTP”，不捏造请求。原7个未归属SVG network事件仍按旧报告保留未知，不用于扩充raster覆盖。

## 滚动协议能证明什么

实际保存的`measured-runner.mjs`两端版本SHA分别是baseline `12f3488c0e09435fa7c0d3711b076926b33505f297e34f935cea31028ed71d49`，after `1158e8c8cd93bbbf9ea2fbf8ff6f67f11a18012ea8685adceb4e36460638ac46`，均与各configuration记录吻合。两者采用相同逻辑：

1. 拍一次容器几何；`step = max(150, round(clientHeight * .8))`。
2. 连续设置`scrollTop=min(y,max)`到末端，再反向到顶部；每次sleep100ms。
3. 一整轮下/上结束才等待2000ms，随后end再等700ms；没有每个视口的加载屏障。

在after几何中step=712，maxScroll=36340。712小于890，因此**所命令的纵向视口区间数学上无间隙**；并没有证据支持“工具故意隔页跳过281张”。但工具没有记录每次设置后的实际scrollTop、每卡rect、浏览器绘制或IntersectionObserver回调，不能从这段代码倒推出每卡都发生了有效可见订阅。主线程停顿、IO回调时序与动态DOM几何也未逐步记录。

after两轮wall分别13571/13516ms，包含约10.6s命令sleep、末尾2000ms和700ms settle/观测成本。最后回顶部的额外等待只能帮助当前顶部卡，不能保证早已离屏的中间卡完成或重新排队。第二轮仍生成70派生，不是全warm。

## 实际产品机制与因果边界

此次只读确认以下三个root模块逐字等于正式after接受的1507d66a源码，并将SHA记入小JSON，避免用后来不同实现解释历史：

- `AttachmentGallery.tsx`：每卡IntersectionObserver root为gallery-scroll，margin120px；visible驱动480px thumbnail hook，离开后hook取消订阅。所有filtered卡直接map，没有windowing。原件仅独立active用户动作后获取。
- `use-attachment-media.ts`：allowed/identity变化会清loaded并在effect cleanup调用cancel；没有保存离屏待完成卡的永久加载要求。
- `attachment-source-pool.ts`：thumbnail并发上限2；queued且最后subscriber取消会retire并从queue删除，不经过IPC；已经running但最后subscriber消失时，晚到grant直接dispose，不发布。再次进入应产生新request；同key失败会retire，下次可重试。

Rust thumbnail cache的生成semaphore为1。真实raster acquire耗时min8.31/p50 113.47/p95 221.63/max692.76ms，这包含IPC、队列、生成或cache hit，不是独立decoder耗时。100ms滚动节奏持续引入多张卡，存在“进入预取→等待→离开→尚未IPC即撤队”和“grant已晚到但不再发布→无HTTP”的真实机制；快速失败SVG耗时更短也符合50SVG全部申请、raster覆盖较少的分布。

这些是**源码可发生机制+观测相容性，不是281个ID逐项已证实原因**。旧raw无frontend queued/running/retired、原因、subscriber数、成功publish或img load/error ID；release行也没有lease hash。因此四类结论如下：

| 候选原因 | 本轮判定 |
|---|---|
| 命令坐标跨度直接跳过整屏 | 未发现；命令区间连续。但实际逐卡访问仍未知 |
| 可见队列尚未完成就离屏撤出 | 真实代码机制，时延/覆盖分布相容；逐ID原因未知 |
| 卡片持续可见却不申请/失败后不重试 | 不能凭当前raw确认或排除；旧末端snapshot不足以验收 |
| 281项准确划分 | 当前未知，不补比例；96个grant无关联HTTP也同样不补根因 |

## 建议105的双端同协议

先冻结并独审工具，再仅一轮paired。不能用直接对backend循环500次生成替代画廊，也不能只给after更慢访问而沿用旧baseline结果。

**相同输入和真实产品路径。** 保留503原件/SQLite/map逐SHA、同viewport/StrictMode/实际Chrome版本、相同settings与真实“查看附件”菜单入口。baseline必须核准其原接受源码/实际frontend/binary来源；after核104及其所有接受组合和字体hash。旧baseline的真实原件Base64路径与after的lease缩略图路径分别记账，不把它们伪装为同API。继续串行Chrome/host与共享target、空间阈值，不复制原件或清活动cache。

**完整访问与速度两种口径不要混合。** 新完整访问阶段建议每步最大0.5个容器高度，记录实际scrollTop并等待两次rAF，使相邻viewport有重叠。每次先固定至少500ms停留，再等待当前实际可见卡（任何面积相交，含顶部/底部部分卡）全部达到terminal：真实img complete且naturalWidth>0，或产品明确的可归属错误。两端同一谓词、同一30s上限；timeout记录失败，不滚走掩盖，也不自动点击retry制造成功。terminal等待/实际运动/总wall分开报告，避免把“更快滚完但未加载”称性能。精确数值在小型协议验证后锁定，正式paired中不得按结果调整。

一轮顺序下/上后必须按500个冻结ID审计visitation与terminal。若剩余ID没有进入视口，按两端同样的确定性补访协议定位真实卡片，仍经连续滚动并等待、记录该阶段额外成本；不要直接fetch/调用acquire。若卡在持续可见的停留窗口内始终不申请或不能terminal，直接列产品候选缺陷交作者独审修复。不能用补访掩盖首次失败；首次与补访分别记账。相同访问协议不要求两产品加载耗时相同，wall正是要测的结果之一。

**逐项观测必须补齐。** 只读DOM/IntersectionObserver旁路观测记录每卡ID的DOM出现、可视相交起止与累计停留、实测rect、对应真实img src摘要/尺寸/load/error、产品错误文本及terminal时刻。不能设置src/load或替换URL。observer只观察，不改变产品IntersectionObserver/queue生命周期。

后端仍使用真实IPC/HTTP日志、原件/小图purpose计数；每个ID通过source摘要关联申请、grant、HTTP、解码。前端queue内部若没有已接受的只读observer，**enqueue/离屏撤队原因继续unknown**，不可由DOM离屏推造cancel事件。新增内部observer如有必要，必须单独评审、两端等价且不改授权/调度；不能在本轮只读研究中偷偷注入。仅完整DOM访问和后端结果就能先区分“没有访问”与“持续可见但没结果”。

**图像和长媒体保留功能门槛。** 450raster与50文字SVG逐项分别报告申请/HTTP/解码/错误/未知，500完成率是独立门槛。SVG必须将实际产品所得PNG关联原SHA、字体/算法身份及104去字ROI证据；可在既有HTTP响应完成后由CDP取该响应body作只读像素核验，不能另发backend请求凑覆盖。需要新的同源去字参考时应为分析用参考、单列成本，不混为产品访问/生成成功。保留90min音频与两个大视频的原真实按钮、激活前零原件获取、完整metadata/time推进/90%seek，基线真实失败也如实保留。

**测量解释。** 冷：新自有Chrome/host/Store/空派生cache，但OS缓存不驱逐；暖：明确上一遍500逐项成功后复用派生cache，不能仅凭第二轮命名warm。分别报告rAF/longtask、加载等待、总wall，Node/Rust/renderer RSS独立；原件HTTP、小图HTTP、generation attempts/hits、登记逻辑输入和派生输出分别计数，逻辑不是物理IO。内存仍是混合population实测；完整500功能门槛不满足时不得宣称等功能内存收益。自然retention和诊断GC分开，最终合法打开note的leases保留，不追求强制归零。

## 本轮交付与后续门槛

本轮只写此分析和84.6KB逐ID纯复算JSON，不修改任务状态、产品、旧runner/raw、冻结数据或104作者树；没有新性能结果。104有正式block反馈时优先回作者树窄修。105应先完成最小工具/小样本真实DOM协议验证并独审，再获parent明确gate执行paired；当前没有执行授权。
