# 程序化调试与验收

2026-11-06。用户要求全部应用功能可通过调试指令调用，开发工具读取渲染后的 HTML 做交互和界面对比；录音可用 Fake/Mock。测试策略以本页为准。

79新增验收：附件闪烁须在实际FileChooser→FileReader→保存/正文ACK全过程用MutationObserver+rAF记录遮罩、visibility和Host/既有媒体节点身份，保留修复前可捕获的反例；quiet显示不取消trusted/access/owner闸门，权限prepare/陌生session/失败/强同步并发仍应遮挡。数据管理默认fixture只证明UI，正式统计需与真实Rustfresh目录逐文件stat/mtime/分类总量独立核对，缺失/未知/symlink不能伪装成功；图片卡/预览/管理行导出须比较原文件完整字节，并经真实Session测试撤权、目标保护、失败。实际Rust→bridge→App接线、全媒体归档导入新PID恢复、Android ContentResolver编译与provider运行分别记账，不把content URI假设成普通路径。完整规格见[数据管理79](ui/data-management.md)。

77新增：全局搜索高亮必须验证连续字符Range位置、实际ellipsis前首命中可见及220→280→220宽度恢复，不能只检查textContent。右键须由真实鼠标/DOM contextmenu坐标触发，覆盖边界和目标笔记；调试框架的首次transport未完成时TIMEOUT可无lastState，分开验证已观察状态与真实截止，保留慢首次/迟到true/永不结束谓词场景。最新[主线148/9/43/43回归](verification/mac-feedback77/integration/README.md)与旧失败分别记账。

运行命令、参数、完整入口矩阵与模拟边界见[开发命令与布局检查](debugging.md)。

73新增验收约束：保存卡重挂载时不能用全局idle或标题存在冒充媒体就绪；需有界等待实际HTMLAudioElement的音源/metadata，再操作会因源变化重建的展开控件。固定600ms读延迟复现与正例纳入手机43项。每份正式结果记录自然进程退出码与含清理wall，视觉/CLI内部计时各有边界。[主线证据](verification/mobile-recording-primary73/integration/README.md)保留旧失败与后续通过，75优先补手机附件的当前Rust Session/Store真实落盘与新进程恢复；74桌面录音真实Rust链后续单独验收。

## 统一入口

显式启用的开发模式提供版本化、类型化调试接口与命令 catalog。命令调用应用现有处理器、编辑器命令及保存流程，不维护第二套成功逻辑，不直接改状态或数据库绕过业务。普通生产构建不挂全局调试对象，也不包含测试后端或音源。

控制台支持 list、execute、snapshot、waitForIdle；命令行支持列举、单命令、JSON 步骤脚本和分组/全量场景。同一浏览器及服务生命周期可复用，逐场景隔离数据。已有功能必须可由语义命令或明确的 DOM 操作到达；catalog 逐项列支持方式、平台边界，现有 disabled/未实现功能明确 unsupported，不能返回假成功。

功能覆盖导航、新建、编辑、保存、撤销重做、格式、表格、搜索、标签、普通与智能文件夹、移动、置顶、删除恢复、锁定、纸张、附件、OCR、录音、视图主题设置、导入导出、菜单、关闭及退出意图。语义命令直接调用真实 handler；DOM 原语验证控件接线，两者结果交叉检查。智能表单、文件选择可组合步骤完成，不能把所有语义命令仅包装为 selector 点击。

## 平台与数据

默认 runner 用新浏览器 context 和合成工作区，模拟必要 IPC、系统对话框、剪贴板及设备边界，驱动真实 App、Editor、SaveQueue、Panel、Session 与 HTML。每份结果标明模拟边界，不外推真实 Rust 存储或 OS 菜单/权限/设备。原生开发入口使用现有真实 bridge 和权限规则，不新增通用后门 IPC。无需操作当前手机或已运行安装包，不默认读写用户实际笔记。

模拟媒体只来自固定合成 PCM/音源。可控制录音流、时间推进、授权拒绝、启动失败、封存/解码/存储/正文保存失败及延迟，返回有效可解码音频，驱动现有会话。禁止假画波形、直接设置“已保存”、跳过累计编码或正文 ACK、使用真实麦克风。时间不能完全虚拟化时如实报告等待边界。暂停继续、连续 checkpoint、同卡替换、关闭完成、退出、A 录音 B 编辑/搜索、保存失败重试是常用快速场景。

## 观察与比较

每条命令返回结构化结果和明确错误。idle 等待真实异步保存与渲染结算，有界超时，不用固定 sleep 冒称完成。快照提供目标区域原始 HTML、规范化 DOM、文本、可见状态、编辑器 JSON、布局 rect 与必要 computed style；截图固定浏览器和 viewport，支持基准和差异报告。测试时钟、随机 ID 可规范化，但不能抹掉待验证的顺序、文本或样式变化。

原版苹果 Notes 没有 HTML，不能声称读取原版 HTML。原版保全录屏、截图、实际观察作为人工标注基准；克隆通过 HTML、布局断言与同尺寸截图逐项对照。交互通过、几何/截图通过、真实平台通过分别记账。

输出用紧凑 summary 和按需目标 HTML/截图，限制默认日志与快照大小；失败保存必要差异和重放步骤，避免每步全量 HTML 嵌套造成大文件。结果含源码身份、环境、viewport、backend/media 类型、耗时、通过/失败/unsupported 矩阵。常用套件一条 pnpm 命令完成并报告实测时间，不以少量场景伪称全功能通过。

## 验收责任

常态功能回归用调试指令、DOM 和合成媒体；仅原生菜单、权限、真实硬件和最终外观抽检保留少量实际验收。旧脚本可保留，公共模拟平台和调试接口要复用，新增测试不得再用字符串替换 App 源码注入私有入口。需验证生产排除、非法参数、不存在命令与资源清理。


任务71将手机录音作为独立命令组：`pnpm debug group recording --mobile --out DIR`。手机MediaRecorder合成边界必须输出连续单容器的增量块；多次暂停最终存储字节需实际解码完整活动时长、验证后段非零样本并真实播放，不能只检查计时器。手机暂停不套桌面checkpoint规则。异步状态用真正await的有界轮询验证；同步truthiness轮询不得接收async predicate。CLI显式waitForIdle的无效raw参数、超时与异步APP_ERROR应保留原错误code。

任务71初审发现三项阻塞，修复记录见[独审后修复证据](verification/mobile-debug-recording71/fixes/README.md)。保留初审两次手机重试失败，不用历史37项通过替代可靠性结论。idle须等实际在途retry整体Promise结算后判断残留失败；deadline须覆盖state/predicate等待；rawidle JSON传输须保留own __proto__并严格拒绝。


任务75补充手机`attachments`组，真实choose→hidden FileList change→FileReader→原operation→正文ACK。发现与修复按证据分开：空笔记多选自动NodeSelection替换上一卡；多图读回跨下一项同步后永久AccessChanged；File.type缺失的已知签名分类；FileReader.abort永悬；重试成功后的残留错误。不得把未复现的Android设备故障直接归因到其中任何一个。保留原失败JSON/HTML/PNG和runner失败记录。默认Fake、受控真实Rust、原生设备unknown分别报告。

75真实Rust附件验证必须先显式从当前递归Session/Store及全部实际依赖输入构建小transport，locked/offline，绑定source/binary哈希；手机PNG+普通文件必须检查真实文件字节和正文唯一引用，关闭owned进程等实际exit后，新PID同fresh目录恢复。register_save_intent→Session.register_save、saveNote→Session.save，附件走Session，read先Store owner再Session.sensitive/tagged；不伪造权限屏障ACK或新Session收养老operation。协议故障测试处理spawn/非法JSON/未知重复ID/超长/EOF/timeout/待处理拒绝及关闭实际退出，失败不fallback。完整默认桌面100、手机录音43、手机笔记9、构建、生产排除仍须在同一冻结源码复跑，新手机附件与真实Rust项单独计数。自然进程退出码及含最终清理wall为正式耗时。
