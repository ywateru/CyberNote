# APP-SYNC86 两个实际App页面与生产Rust同步整合

状态 pending，depends-on 86 frontend修复独审合入、86 adapter冻结并独审合入。根负责准确源组合与完整整合，脚本实现和独立复核由不同代理。

objective：两个真实React/Tiptap App DOM分别连接独立当前源码Rust transport、独立SQLite/附件目录，使用真实84 Store＋85 Noise socket＋86 Runtime/Session quiet gate运行用户路径。不得用FakeBackend/JS merge或注入伪metadata替代该层。仅设备、合成媒体、clipboard/dialog等明确本机测试边界可模拟。

context：docs/architecture/sync.md、sync-coordinator.md、docs/plan/tasks/app-sync86-adapter.md的本机stdin接口、docs/testing.md、docs/debugging.md。UI实际命令见sync-settings与debug catalog。

path：scripts/debug/sync-rust-dom.mjs及仅该runner需要的runtime/rust-backend可选参数与异步poll helper；docs/verification/sync86-dom-integration/。不改生产前端或Rust来迎合断言，失败交各作者最小修复后重新冻结。现有runtime默认行为不变。

## 真实创建链与事件

准确source fingerprint及binary hash验证后才启动两个独立Rust进程；每个页面进入App就登记main，页面销毁时注销。生产AppHandle真实窗口由86原生接入证明，本工具只stdin报告自己的实际页面集合。sync_command可能等pair27s，客户端timeout至少35s；所有请求按requestId关联乱序返回，持续并发poll_events。所有响应携带的events原子排空后恰好一次通过既有本机事件控制器交App；不能先等sync_command结束才投递probe/prepare。退出先安全注销/abort再关页面/进程并核自然exit0。禁止用headless_apply跳过有页面的quiet流程。

端点只用本轮临时localhost/LAN合成库。两端开启/配对走实际UI handler/debug命令，生成的邀请只内存传递，日志/HTML/截图不记录secret。查询实际数据库投影、inbox、各media文件hash和真实App state三者验证收敛，不靠status文字断言。

## 阻塞验收

1. A输入创建→B可见→B编辑→A可见，目录/置顶/智能规则与既有两端本地记录共存；进程重启原目录保持，身份不漂移，停止/恢复不丢dirty。
2. pending保存时接收同笔记更新，目标准备必须先flush保存，冲突heads保留本地输入；不同笔记更新不得重挂当前editor/view/DOM或清Undo/抢焦点。正文相等metadata同样不重挂。
3. CDP Input.imeSetComposition/insertText产生实际PM composing/TagComposition，不只dispatch空event；远端A在真实组字期间留inbox，自然settled后保存/应用，无人为强制end。prepare期间搜索输入/Escape与普通导航必须等待cancel终态；abort同DOM焦点恢复，不抢另input焦点。
4. 合成录音owner A全ticket至最终document/journal ACK/release都保护；B普通编辑及B lock/delete可先应用，A仍继续checkpoint与最终保存到A、媒体非零可解码且字节完整；远端修改A本身直到release才应用，无强制pause/close/owner漂移。以真实Rust access/global epoch触发重绑，不伪造snapshot。
5. 实际filechooser持有picker及附件storage/document ACK期间，远端目标更新延后且无关B继续；原bytes持久保存、图片加载/原字节导出/新进程恢复。chooser/OS边界仍浏览器，最终Android provider另87。
6. window集合变化、cancel先于commit、stale generation、未知reply/expected、丢收据同operation重试、目标lock/delete不得恢复旧editable，覆盖真实Session和event链。实际网络篡改/大包/多端/崩溃广矩阵由Rust模块与87记录，此层不重复全部低层测试。

准确记录每个证据的前端/后端/source head、PID、临时目录、端点、protocol、byte hash、自然exit/wall与pageErrors。所有原始失败保留，不改写原报告；有失败只恢复受影响边界并重新冻结。脚本输出运行中写/private/tmp或隔离out，避免Vite监视证据HTML导致reload。原Android/旧AVD含5580完全不动，真实mic不用，AppleNotes不删除，不公网公开真实用户库。
