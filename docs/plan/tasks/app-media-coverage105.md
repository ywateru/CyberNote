---
id: app-media-coverage105
scope: paired-performance-coverage
status: accepted-evidence-native-runtime-open
---

## objective

补齐完整P1性能证据：原99M报告仅169/450 raster触达后端，50文字SVG全unsupported；该记录真实但不能证明等功能覆盖的大量附件优化。104验收后，使用现有503个冻结原件及同一SQLite快照，改进双向一致的画廊访问协议，取得全部500图像附件的逐项可追溯结果，再对比启动、内存、滚动与长媒体按需读取。保留旧报告原始数据，不改写历史结果。

## protocol before execution

先定向审查原169/450覆盖缺口与滚动工具，判断是访问路径跳过卡片、可见队列未完成就离屏，还是产品缺陷；不能预设都是工具问题。以实际App DOM、IntersectionObserver、请求/生成计数和逐附件结果确认。访问协议必须同样应用于原accepted baseline与新after：相同视口、滚动步长/速度、停留与加载等待、冷暖状态、用户按钮、测量口径，不只给after补直接后端请求。只测后台500次生成不替代实际画廊访问。

对每个图像报告在DOM出现、进入可视区、申请/到达后端、成功派生与解码/明确失败，区分离屏取消、未访问、错误和未观测。若发现产品在实际访问下跳过可见项或无法重试，另交窄修复并独审，不能调指标掩盖。保留thumbnail/original用途、源读取和传输分项；长音视频按钮激活前零原件获取、后段seek同原协议。新文字SVG至少逐项证实可见文字，不能靠背景非空。

## resource and delivery gate

复用冻结原件，不复制715MB样本、不改用户库、不另建Cargo target、不直接重跑大测。先由作者准备最小工具变化与小型访问协议验证，交不同代理独审接受后，才进行一轮准确paired运行。旧baseline源码/二进制来源、字体104与最终after指纹要分别核实。序列化浏览器与host，限制并发和空闲空间阈值；活动缓存不清，完成后清任务独占中间件，保全部raw与报告。结果必须重新计算逐项覆盖、前后计数、错误与阶段指标；记录完整接受不能替代等功能覆盖接受。原生实包的大媒体seek/loopback与浏览器基准继续分层，不用小样本冒充完整native基准。

## accepted small-tool implementation gate

2026-11-10：104源码整合独核已通过。采用[固定协议](../analysis/media-coverage105-protocol.md)及[最小清单](../analysis/media-coverage105-implementation.md)。串行作者在root仅改measurement tools，独立review在作者冻结后执行；保留旧99M模式/gate/raw。接受旧baseline artifact pins与其历史dirty源码无法完整恢复的限制；105不冒称重新证明历史asset构建绑定。after固定root revision bf26dae17f972fc09276deb456b4599e1ebe5d67、dirty true、fingerprint a5b783239e3a2372a013a50ed73b72d4751d134c5e3285579095edafa91c9bb9、445inputs，已有103+104独核而无新原生包。

仅允许一次新after native-free harness/frontend与两侧相同小型实际App代表项检查；字体用唯一源码symlink并逐SHA前后核，冻结原件不复制、baseline不重建，root共享target/jobs2/incremental0/debug0。小样本可用真实产品搜索/选note过滤，避免为找到SVG走完整500。关联不唯一即停。完成工具与独立审查后另给正式paired gate，当前无500测量/原生包/设备授权。

## representative-tool review and formal remainder

2026-11-10：最终smoke3双侧15图真实解码及唯一source/IPC关联通过；完整500/正式phase/RSS/长媒体尚未实现。工具独审发现F1：finally先落盘/record而后close，wall-limit或ENOSPC会使owned close全跳过。三类源提取受控证明见app-media105-tooling-independent.md与artifacts/media105-independent-review/cleanup-boundary.json。作者仅窄修，修后不同代理唯一代表项复验，不能拿通过小样本替代正式覆盖。

正式扩展复用同一helper和现有host/frontend，不再重复方案研究。文字像素证据采用实际产品已完成HTTP响应的CDP body，不额外请求；主测结束后，以同一生产svg_text::render和字体做480px带字/内存去字参考，实际PNG RGBA须逐像素等于带字参考，去字差异非零且bbox在预声明ROI。分析用小companion可下一gate单次编译，参考成本/字节不混入产品覆盖、主测时间/HTTP。50件串行仅读约2.2MB源，不复制fixture/font或常驻全部帧。正式几何遍历、冷暖、startup/phase/RSS与原三长媒体按原固定协议，工具接受后再给执行gate。

2026-11-10 F1复审接受（app-media105-tooling-f1-independent.md）：14种完整finally故障边界通过，不同代理唯一最终双侧代表运行各15图/15条真实IPC关联通过，四主进程关闭。该组全部scrollTop=0，不构成滚动几何证据。现仅授权正式工具实现、小analysis companion单次编译、两侧相同420px高视口的最小实际App滚动几何检查和必要纯边界检查；正式1440×1000协议不变。禁止正式500paired、长媒体重测和host/frontend重建。精确工具diff/hashes冻结并经不同代理审查接受后，另给唯一正式paired运行gate。

正式工具已冻结交不同代理审查：artifacts/media105-formal-author/formal-tools.patch，SHA256 `115533d4c551062c993b882444fbfbc890ccffd3fe52b1248425d767e8ae3ad1`。作者证据为frozen-tools.json/evidence-summary.json；8纯边界/14清理检查通过，真实420px高小App两侧各15图、三组均发生滚动，after5张实际480px SVG PNG同源参考全帧相等且文字差异仅在预声明ROI。首轮误捕startup160px的工具错误已保存，只修过滤后补after，未重baseline。上述是作者结果，正式路径仍待独审，没有500/长媒体执行或新native包。

2026-11-10正式工具经目标补访及warm准备两次窄修后独审接受，见app-media105-formal-tooling-independent.md、app-media105-formal-f1-independent.md、app-media105-warm-position-independent.md。最终warm patch `b5a0a47066fca22ac465896019d135208e336d33424a44247fd6149ca81f6934`；仅工具接受。父级现授权唯一正式baseline→after paired，输出artifacts/media105-formal-run1，不覆盖历史，复用既有二进制/前端/fixture/companion并保全部固定停止边界。不能调整阈值或失败后追加变体。实际结果及逐项独立复算仍未产生，没有新native包或设备授权。

run1结果已产生：两侧因观测join断言停止（baseline436、after24 decoded），未进入warm/长媒体，不满足500等覆盖。没有产品pageerror/明确错误/timeout。作者报告media105-formal-run1.md与原raw保留；join两次evaluation存在TOCTOU疑点，实际offending source缺证，正交不同代理只读核对，不擅改为产品失败或成功。当前没有重跑gate，产品源码仍为接受的445输入，最终双包已获串行构建gate，设备/README发布未授权。

2026-11-10续接执行gate：run1原始失败及未知触发保留；原子同次DOM观测与after真实ownerless IPC→唯一successful/tagged wrapper→grant的窄修均已独审接受，最后复审见`app-media105-after-owner-independent.md`（24条真实关联回放、12独立负例、10pure、14cleanup）。当前真机IME另案已结束，不再操作设备。父级授权**一轮**准确baseline→after paired，输出新的`artifacts/media105-formal-run2`，不得覆盖run1；先核最终工具SHA/精确产品445输入/Chrome/fixture和无活动构建、≥5GiB，再复用原host/frontend/ROI companion执行固定协议。该gate不允许改工具/产品、重建、复制原件、放宽阈值或失败后追加变体。全部raw/终止原因保留，作者结束后不同代理逐项复算；没有原生安装/README发布授权。

run2执行结束，全部owned runner/host/Chrome/ROI进程已退出。作者结果：after exit0，8阶段完成（无补访），500图cold/warm与50个实际SVG PNG文字ROI、三长媒体均通过；待独立复算，不能提前称paired收益。baseline500历史图像成功但cold向下近底部30s timeout、未进warm/媒体。作者更正原先“回程”口误：实际scrollTop36045/max36277；当前未settled的是sample501/502原生video卡的image:null，疑为观察器错误要求video有img而非产品图片失败。不同代理正在核冻结raw及video屏障最小修正原则；未授权修改或新测量。HTTP thumbnail读取、派生输出及注册source logical input独立报告，第二遍有实际再生成，不能称全cache命中。

run2 F1已由不同代理实际raw确证：14可见卡中12img均resolved，唯501/502两nativevideo卡image:null，约29.9s持续同位置；其真实read526/527各96,754,277B成功，固定baseline frontend的真实video分支及failure图一致。父级仅授权作者窄修measurement kind边界：冻结mime/ID与实际nativevideo DOM双确认，video poster单列；不得用“缺img”或sampleIndex一般跳过真正image卡，不改变500分母、真实source/IPC关联、时限/滚动/产品IO或初次play策略。保留原run2所有失败/成功raw。仅必要纯边界与实际失败行回放，冻结差异交不同代理独审；不重建、不启动浏览器或新测量。正式下一次执行仍须另gate。

2026-11-10 run3执行授权：run2新版完整证据及nativevideo工具窄修均已不同代理独审接受，见`app-media105-formal-run2-independent.md`和`app-media105-native-video-independent.md`。13原工具已完整保全且逐SHA匹配。只读预检见`artifacts/media105-run3-preflight/`，root仍445/a5b783…、固定原件/Chrome/实际binary/frontend/ROI一致。106作者的旧实现浏览器检查因隔离依赖缺失自然退出（未构成产品结果），作者已确认无残留测试/浏览器，并暂停后续所有执行。父级现授权唯一baseline→after正式run3，按预检exact命令、启动前再次身份/空间/无活动检查，≥5GiB起始/2.5GiB停止；保相同协议及所有原阈值，不改产品/工具/fixture，不重建或重试。输出新`artifacts/media105-formal-run3`，保run1/run2全部原始记录。任一侧失败保存准确原因，不额外变体；两侧完成及owned退出后交不同代理独立复算，不预判收益。测量期间106仅编辑隔离小源码，root产品不整合，不运行额外测试/build/设备。

run3已完成并获`app-media105-formal-run3-independent.md`独立接受：148份冻结证据41,255,323B，双方cold/warm各450raster+50SVG、当前source/实际IPC链均核过；新版全8阶段、50实际HTTP PNG/既有同源ROI、三媒体真实激活/推进/90%seek通过。旧版audio推进断言失败，local numeric time/src未保存，原因未知，不重试或补造；不接受完整8阶段paired胜出。单次完整图像阶段对比：新版cold用时+5.35%、warm用时-10.69%，renderer峰值RSS分别-31.33%/-40.84%，warm rAF p95由16.8变33.4ms，不称全面流畅改善；两侧实际几何/路程不同，保同访问算法与同500覆盖的有限解释。7个known owned根进程已全部退出。正式测量到此停止，不新增run4追求通过；原生准确最终包中文缩略图/长媒体验收仍在整体交付任务中开放。只可精确清理独审已不依赖的任务派生cache，保raw/实际HTTP PNG/完整tools/DB/原件/二进制/frontend。
