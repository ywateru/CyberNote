# 附件持久操作模块：独立源码审查准备

2026-11-04，verify。状态：**仅契约准备，等待 native 冻结提交与 target 释放**。未审查或验收未提交实现，未运行 GUI、设备或构建。root 持有主工作区 git；verify 不改产品、不提交主工作区。

契约来源：`docs/plan/tasks/app-002-attachment-store-01.md`、父任务 `app-002-attachment-submit-01.md`、`docs/architecture.md` 的附件提交/授权/SaveIntent/恢复契约。真实失败基线 `app-002-mac-attachment-baseline-01.md`：旧56d7包的PDF已落盘、元数据存在、正文无引用且冷启持续；该旧孤儿没有新operation身份，必须保留。入口错误的精确抛错点未经trace，不能据此要求后端放宽授权。

## 冻结与复跑条件

native 回交实际 commit/base、已提交6个Rust文件列表与hash、工作树状态、生产命令和返回结构说明、必要测试命令/退出码、14 pass / 1 worker ignored 的原始输出与真正执行worker的方法，以及共享 target 明确释放。独立只读取该提交差异及必要被调用的既有生产边界。未冻结前不对产品源码给通过。

必要真实临时 SQLite/附件目录测试只在 target 没有其他构建后串行运行；不启动新App构建/安装、不与 develop 的 Mac→Android 构建争用。根据测试实际结构选择一次覆盖 Store 和 Session 的过滤组；worker被忽略只是子进程入口设计时，要核父测试实际spawn及退出状态，不能把ignored直接算pass。编译或真实失败保存后先解释，不重复全矩阵。

## 审查清单

| 边界 | 必须沿生产代码确认 | 真实定向证据 |
| --- | --- | --- |
| IPC与owner | Tauri真实window注入→Session当前随机session身份→实时原note权限/epoch/屏障→Store；命令不接受客户自报window/session作授权；structured错误及access验收信息接线完整 | 错owner/window/session、陈旧授权、删除/锁定note均拒绝且无副作用 |
| operation身份 | 第一次可能写文件前已有持久受管新建记录；operationId形状/长度有界；相同ID的note/owner/name/mime/内容不允许被覆盖复用 | 重复同内容返回同一附件；同ID不同内容/owner/note明确拒绝 |
| 文件与SQLite顺序 | create_new不覆盖既有路径；文件和目录必要持久顺序；attachment metadata与stored状态同事务；故障时保留可恢复记录，不假设FS和SQL是单一事务 | 文件落盘前后、metadata事务前后真实重开/子进程中断；实际bytes/表/operation核对 |
| 查询与未知响应 | 原调用已写但响应丢失，当前合法授权能核真实stored状态；未知operation用明确状态；不能查询别window/owner或失效note的敏感元数据 | 丢响应后同操作查询/重试得到同一id；未授权查询不泄露 |
| 确认引用 | 客户不能自报成功取得committed；Store核权威持久document的attachment引用、实际owner与kind；无法解析/锁定或核定失败不视为可删 | 未引用不可确认；真实正文引用后confirmed；非法/跨note/kind拒绝 |
| 在途保存和屏障 | Session对所有相关未完成SaveIntents与访问barrier核查，检查与Store决定在既有mutex内串行；Store不冒称知道尚未登记的renderer pendingDocs | 活跃SaveIntent/barrier时deferred或授权拒绝，文件不删；完成后结果正确 |
| 窄补偿与幂等 | 只按operationId查可信本次新建记录；不接受路径/任意附件ID；已有持久引用返回committed并保留；不能安全判定返回deferred；真实文件错误可见 | 未引用取消、重复取消、已引用取消、在途保存、文件错误，不误删其他操作/历史附件 |
| 冷启恢复 | 仅有本模块operation记录的新文件；引用已提交则保留，未引用且确定未完成才清；恢复失败保留可重试身份，不抹掉日志 | 重开引用/未引用两类；旧附件、旧孤儿及其bytes保持 |
| 永久删除/导入协作 | 旧journal不能在同路径后有新对象时删除它；核数据库当前path引用、原新建身份与状态；保持现有imports恢复先后/公开archive格式 | 至少源码沿purge/import/open顺序核清，必要复用已有真实用例，不扩全量archive矩阵 |
| 兼容与范围 | 旧store_attachment行为保留；新生产命令实际注册、序列化名/参数/返回与文档一致；不改依赖、前端、录音或搜索 | 六Rust文件提交差异和依赖/公开格式核对 |

## 结论范围

独立审查将输出 findings（P1/P2/P3、blocking与具体契约/代码位置）及 source-ready 或 blocked，保存 source identity、命令原始输出和manifest。即使模块真实测试通过，也只允许进入父任务的前端接线；不能宣称图片/PDF系统入口、正文ACK、前端generation重绑定、重试UI、冷启预览或像素已修好。

父任务仍负责未发起/进行中/失效上下文区分、系统面板返回后的可信同步结果、原目标重验证、insert false/throw、stored/inserted/documentAck/refreshed分账、ACK后刷新失败不重插/不补偿，以及renderer pending正文尚未登记时不误发取消。后端不新增客户端自报“可删/已保存”开关来绕过这些责任。
