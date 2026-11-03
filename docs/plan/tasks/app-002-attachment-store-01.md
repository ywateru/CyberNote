---
id: app-002-attachment-store-01
scope: durable-owned-attachment-operation-and-safe-recovery
status: in-progress
depends-on: [app-002-permission-01]
---

## objective

为APP-002-ATTACHMENT-SUBMIT-01提供完整可调用的Rust持久操作边界，修复“写入成功但响应/正文失败”无可核身份的问题。此模块先独立实施，前端接线仍由父任务完成；模块测试通过不能算真实图片/PDF入口已修好。

## context

阅读`docs/architecture.md`附件提交与授权契约、父任务`app-002-attachment-submit-01.md`、真实失败报告`../reviews/app-002-mac-attachment-baseline-01.md`。现有`store_attachment`只有永久写入结果；调用后renderer可能拒绝该响应，不能假定未写。旧56d7 PDF孤儿无本轮记录，保留证据。

## path

仅`src-tauri/src/lib.rs`、`session.rs`及必要测试、`store.rs`/Store生产辅助模块及必要测试、此任务源码证据。可新增同crate生产模块，不改Cargo依赖/锁、App/bridge/Editor、录音、搜索、纸张或归档公开格式。旧入口暂保留供尚未接入的录音路径，不能突然改变其行为。

## contract

1. 第一次存储IPC前由调用者固定operationId。真实窗口由Tauri注入，Session从自身真实session身份与当前授权构造owner；不接受客户端自报窗口或后端session作为授权。严格检查原note、实时授权和屏障，未知/失效拒绝。operationId须验证形状/限额，相同ID不同note/owner/文件内容不得复用或覆盖；不新增依赖可使用受管原字节核对。
2. 持久operation表或journal与公开Attachment/归档字段分离。需在文件可能存在前留下可恢复的受管新建身份；附件元数据与stored状态同数据库事务提交。相同操作重试返回同一附件，未知响应仍可经当前合法授权查询真实状态。查询不能泄露其他窗口/操作或已失效note的敏感结果。
3. 状态必须区分未持久、stored、committed、aborted或deferred。客户端不能仅自报成功来取得committed；Rust检查权威持久正文确实引用本附件且owner/kind正确。保存队列未完成时不能删除文件。当前进程Session对未完成SaveIntents及访问屏障做检查；检查与Store决定串行在现有mutex内完成。
4. 补偿为“取消本次新建操作”的窄接口，以operationId定位可信受管记录，不接受任意路径或附件ID。只清理本操作未引用的新文件/元数据；已有权威正文引用则保留并返回committed，有未完成保存/屏障/无法安全核定则deferred。补偿重复调用幂等，不误删另一操作、历史附件或已引用文件。
5. Store.open冷启恢复仅处理拥有本轮operation记录的受管新文件。无已提交引用且可确定是未完成本操作时安全恢复/清理；已引用则保留。文件/数据库失败及中断先后次序必须可恢复，不把文件+SQLite假设成单一事务。保留旧附件/旧孤儿、导入恢复日志和已存在正文；永久删除与记录的关系须确定，不能让旧journal删除之后同路径的新对象。
6. 默认生产命令返回结构化真实状态/错误，并带既有access验收信息。不得跳过授权、吞真实文件错误、伪造成功、暴露通用文件删除、引入测试专用生产后门。最终命令名、参数/返回及责任在源码报告同步，供前端接线使用。

## verification

使用真实临时SQLite与受管附件目录穿过实际Store/Session边界：相同操作重复写入与查询、同ID不同内容/owner/note拒绝、写后响应未送达仍能核结果、未引用补偿、已引用不可补偿、在途保存/屏障deferred或拒绝、重复补偿、文件/数据库失败、至少覆盖文件落盘与元数据事务前后真实重开恢复。旧附件与旧孤儿须明确保留。不要只测返回常量，不为此扩展无关安全/归档矩阵。

源码候选提交后独立静态审查，再主合入；无App构建/安装/GUI。共享主target只串行用于必要Rust检查，先确认无其他构建。父任务后续真实系统选择器、正文ACK、冷启预览与像素仍分别验收。
