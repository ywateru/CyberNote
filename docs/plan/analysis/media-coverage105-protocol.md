# MEDIA105 固定 UI 访问协议草案

2026-11-10，独立预审。仅协议，未写/运行测量工具、构建、benchmark 或设备。本协议的“两侧”是原 accepted baseline 与接受104后的 after，沿实际 Chrome + Rust host 产品画廊路径；不把这份500图协议称为 Mac/Android 原生性能实测。后续原生有限播放/seek验证另记，不能替代此等覆盖对照。

## 最少新增观测

无需新增产品队列监听。复用已有 IPC/后端/HTTP 日志，只补下列旁路观测，并先在小样本验证关联完整。两侧使用同一版观察器、滚动器与 schema；观察器不得改产品 IO、src、授权、队列或生命周期。

| 层 | 每条记录最少字段 | 判定边界 |
| --- | --- | --- |
| 统一关联 | run/side/phase、冻结 attachment ID/sampleIndex、card mount序号、img节点序号/source revision、单调时间 | 仅自有冻结库，禁止用文件名/文字近似关联。ID从现有data-attachment-id取；两侧原 gallery 均已存在该属性。 |
| DOM/可见 | 卡片出现/移除、容器与卡片实测rect、实际scrollTop/clientHeight/scrollHeight、可见起止和累计时间 | 可见=卡片与容器及浏览器视口有正面积相交。另记120px预取区，但不能将预取算实际访问。 |
| 图片结果 | currentSrc的本轮局部token、load/error、complete、naturalWidth/Height；产品明确错误及其ID/时刻 | 监听必须在load前安装；已完成图片初次采样补snapshot，不能漏掉缓存load。source变更清旧结果，不将上一mount/source的成功套给新源。 |
| 解码屏障 | 对已load/complete/naturalWidth>0的当前src，仅一次img.decode()的resolve/reject/耗时，再核节点仍连接、src未变、两次rAF | 此调用是固定访问屏障，会产生解码工作；两侧同用，单列其时间，不叫零开销观察。无新src/fetch/load/play，不拿naturalWidth单独冒充完整decode。decode缺接口时整个协议预检失败，不临时换谓词。 |
| 申请/授予/HTTP | IPC request序号、attachment ID、真实purpose/API、返回结果/错误、grant或source token；HTTP request序号、status/完成/取消、传输字节/未知 | after通过真实返回URL/lease的局部摘要联结currentSrc与HTTP；不记录可复用capability明文。baseline保留其真实read_attachment/Blob路径，HTTP为不适用而非0，不伪造grant。 |

上述字段足以区分未访问、持续可见无结果、已授予未发布、已发布未HTTP、HTTP后解码失败。尚无内部queue观察时，queued/running/retired/离屏撤队原因均记unknown；不得从DOM离屏倒推出取消原因。Blob/URL关联无法唯一时标unmapped并阻塞等覆盖结论，不新增大字节拷贝/完整Base64摘要来补关联。页面/host时钟各自保存；跨进程只用请求因果关联，未校时不能精算跨钟延迟。

## 固定输入与阶段

1. 冻结manifest、500图像映射（450 raster +50 textSVG）及SQLite SHA；原503文件仍只读。只允许任务自有SQLite工作副本/原件硬链，不改用户库或复制715MB原件。记录baseline准确源码/二进制/frontend、after完整组合指纹、104字体SHA/缓存版本及工具SHA。
2. 相同实际Chrome版本、1440×1000 viewport、deviceScaleFactor、StrictMode、settings、类别/排序和产品“查看附件”菜单路径。每侧串行使用独占host/profile/工作cache。不得以旧99M raw当新baseline结果。
3. 冷定义为新owned进程/profile、空任务派生cache；不驱逐OS页缓存。允许用完全相同哈希校验流程预热原件，明确该事实。HTTP cache/routing策略两侧一致。不得清活动cache或强制GC制造冷/回收结果。
4. 顺序为startup-cold → gallery-cold-first-pass → 必要首次补访审计 → gallery-warm-pass → gallery-leave → 固定长音频/两视频激活与90%seek → final-leave。只有500图均成功后才允许称下一遍为完整warm；有任意失败则记partial-cache，不改名称掩盖。

补访在最后目标达到终态后停止，不额外到底或回顶。若补访后500图均成功但当前位置非零，在warm之前以独立`gallery-warm-position`记录同样半视口步长、当前源等待屏障的连续归顶；route、wall及IO使用原阶段统计单列。确认实际top=0后开始完整warm down/up。已经位于顶部则不增加准备阶段；不能跳跃归顶或隐藏这段成本。

## 唯一滚动与等待算法

- 每轮从实际top=0开始。实测容器高度H，每步滚动不超过floor(H×0.5)，记录设置后实际scrollTop，并等两次rAF；高度若变化，用当前H继续，不能造成实际区间空洞。下行直到真实底部，再用同规则反向到顶部。不得scrollIntoView跳跃、修改卡片尺寸或直接调用acquire。
- 每步固定最少500ms停留，随后等待本次相交卡片的当前source达到terminal。等待期间不继续滚动；新增/替换相交卡纳入当前集合。terminal成功=上述解码屏障通过；terminal失败=当前卡明确产品错误/img error/decode拒绝。所有屏障均记录卡片/source identity，防止陈旧成功。
- 每个静止视口固定30s截止，包含500ms和解码等待；不得按side/附件类型调节。首次timeout立即保存实际视口/每卡状态/请求链，停止该侧，不自动retry或滚走。后续项记未访问，整轮不能作等功能性能胜利。明确错误可继续访问以形成完整失败分布，但其卡不计成功覆盖。
- 所有500图按manifest逐项对账：DOM出现、实际可见、申请、grant/源返回、HTTP或不适用、解码成功/明确失败/timeout/unknown。数量相等不是关联证据；视频poster另列，不挤入500分母。
- 首轮上下完成后仅对“从未实际相交”的ID允许一次确定性补访：按当前DOM从上到下顺序，以相同≤0.5H连续步长/屏障走到卡片，不能直接fetch。初次错误/timeout不进入补访重试。缺DOM或不可达ID保存证据并判失败。首次与补访wall/字节/生成/错误分别报告，不能合并伪装首次完整覆盖。

## 有界执行及停止条件

先用既有少量代表卡验证工具（两侧同协议，包括一张文字SVG），不同代理接受工具及关联schema后，父级才给一轮正式paired gate；当前没有执行授权。小样本阶段不得静默修产品或扩大到500生成。

任一侧出现以下情况即停止，并保留raw，不继续“补齐”指标：身份/fixture SHA变化、进入用户库、URL/ID关联歧义、observer丢记录/不可用、非预期pageerror/host退出、单视口30s timeout、容器实际位置不前进且未到底、滚动步数超过初始几何上界的2倍+20、该侧总wall超过45min，或空闲空间低于2.5GiB。开始前至少5GiB；跨阈值只结束自有进程，不清活跃cache。明确unsupported等产品失败可以记录后继续，但已经取消等功能成功结论。

所有超时和上限在小样本后冻结；正式阶段不得据结果放宽。重复source/mount和请求采用状态变化日志，禁止逐帧全量DOM/大响应正文转存。记录观察器记录数/丢失数和成本；有丢失即停，不能把缺记录补为0。补访最多一轮，全量/后续测试不能无限扩展。

## 结果门槛与保留口径

- 500项必须分别给真实解码/明确错误，成功覆盖与terminal覆盖分开。新增104文字SVG每项关联原SHA、产品实际PNG和字体/算法身份；用已有HTTP响应体做文字ROI对照（原件与去字参考证据），不得额外请求后端来凑成功。baseline若读原SVG按其实际显示结果记录；不同工作负载不等价的部分明列。
- 报告实际运动时间、固定停留、terminal等待、decode屏障、补访和总wall；同阶段rAF/longtask、各进程RSS及JS heap分别列，不合成未经确认归属的App总内存。自然retention和诊断GC另列，不在主访问过程中强制GC。
- 原件IPC/HTTP、缩略图HTTP、生成attempt/success/hit、登记逻辑输入和派生输出独立，不相加叫物理磁盘IO。长媒体只由真实产品控件激活，after激活前原件计数必须为0；记录metadata/time推进/后段seek，原生与浏览器分层。
- 旧版能力差异（正式工具实现前固定）：baseline的视频是原生`<video controls>`，没有新版播放按钮，以真实控件focus+Space激活；after用真实自定义播放按钮。记录各自controlKind与实际输入，不注入初次play/src/load，也不在控件未推进时加脚本play回退。激活前原件零获取是after硬门槛；baseline原有预取照实报告，不能改变旧版行为或把其预取误称激活后按需读取。历史99P的脚本play不作为本轮真实控件证据。
- 首次500未成功或补访有未知时，可以发布真实失败/混合负载数据，不能宣称等功能内存/性能收益。全部raw、工具/输入SHA及停止原因保留；历史99M结果不重写。完成后只清理任务独占、已退出的可再生中间件。
