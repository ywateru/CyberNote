# SYNC90 实际应用错误有限分类

状态：in-progress。前置[SYNC89](app-sync89-native-apply-diagnostics.md)已准确出包并实际证明同一已绑定Store下applyError反复增长、commits=0，目标仍inbox1/note0。证据[actual19](../../verification/sync87-native/native-backend-cause18/README.md)。具体错误尚未确定，不能把没有receipt等同于SQLite未提交。

仅在原Session apply_store返回Err的现有分支中附记有限分类，不改变原e.code/message、分支顺序、返回值、事务或同步流程。保留v1 applyError总计与firstcause；扩展独立诊断为明确version2，增加latestApplyError与固定applyErrors计数。首个apply分类在Quiet保存，计数只在原abort release时更新，读取不清空，不输出错误原文、SQL、路径、身份或业务内容。

分类由原e.code映射固定枚举，覆盖database/filesystem/document及实际sync错误、unknown。为避免仅得到database后再次出包，同一次补充仅对database原错误文本匹配固定SQLite失败类型：foreignKey/unique/notNull/check/trigger/readonly/busy/locked/noSuchTable/noSuchColumn/noSuchFunction/syntax/full/io/other等；只返回固定类别，绝不复制原字符串或捕获部分。具体完整枚举以源码单一来源记录。敏感或未知输入只能返回固定other，原错误继续原样传播。

改动优先限Session synchronization.rs及必要现有测试；adapter/lib入口既有Value透传无需变化。验证固定分类、未知/敏感输入不泄漏、首因与release计数、原metadata/apply错误传播及受影响Session组，Tauri检查；不重跑无关完整前端/adapter矩阵。不同代理独审后主线合入、准确Android20构建/核包，才在同5584原userdata、同已配对Store读取实际分类。原18/19失败保留，确定具体原因后另做最小业务修复，不猜测算法修复。
