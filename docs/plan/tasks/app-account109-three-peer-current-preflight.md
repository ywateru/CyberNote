# 真实三端执行前的当前数据与候选门槛

2026-11-13 收尾：用户已要求停止测试、改为手动验收。第1项已在 `7bb83259` / `c00c4b8f` 收拢；第2项实现 `9273c403`、失败逐端保全修正 `ca504f78` 及[静态独审](../../verification/account109/native/three-peer-preflight-static-review01.md) `14a6ea1e` 已合入 main。最终修正及新增 fixture 未运行，完整整合及实际三端验证仍未完成；不要按下文原计划自动执行。当前交接见[收尾记录](../../verification/account109/CONSOLIDATION.md)和[手动指南](../../verification/account109/MANUAL-TESTING.md)。

2026-11-13，main `2fbe55df` 源码准备审计发现 three-peers runner 的暂停观察在慢读取时仍会过早断言；候选仅记录hash、手机仅捕获当次内容，未绑定已独核的完整当前快照/历史owner；两个原桌面的完整既有数据也未被独立保护。手机最新只读状态仍signedOut，暂不发起授权或三端实跑。

分为两个独立修改/审阅：

1. 暂停采样保持原要求至少2次/至少3秒，二者都满足才能通过；固定有界观察上限、非负wait，每次原状态/排除/数据错误直接失败，确定性慢status/workspace及边界反例。Socrates作者，Cicero独审。只修测试执行器。
2. 当前原库三端准备：固定已独核Mac `72513d12` binary SHA与Android `88b2dabe` APK SHA；现有固定QA username之外，强核已提交历史subject摘要。手机登录前可准备固定私有快照输入校验，但实际三端启动时仍须正常健康同QA登录且paused/disabled；既有两桌面也须在先前正常登录续验结束后paused，不使用旧grant恢复/注入。在任意enable/同步/测试写入前核当前手机四篇完整字段、唯一附件descriptor/引用及授权原字节与已独核upgrade私有快照准确匹配，不能采用新的未知baseline。

三端执行前还需捕获两桌面全部既有笔记、完整正文/语义metadata、附件归属/descriptor及授权原字节；在合并、用例结束及cleanup前核原数据保全。跨端只允许已明确说明的投影revision/物理relativePath差异，原ID/语义metadata/内容/附件字节必须保持。不能以仅document/plainText或新建笔记收敛宣称原库全部保全。若原数据中有删除/锁定/未授权条目，先准确报告并停止不能绕过读取或忽略。

Huygens负责第二项作者实现及设备外必要正反例；Feynman独审。尽量复用已有current-login-smoke.loadInputs、preserving-upgrade.capture/sameSnapshot、relogin历史证据及three-peers运行逻辑。禁止新增任意APK/账户/快照/subject/URL覆盖；source/hash指向真实候选，不给未验证产物新身份。模块import不触发设备/私有文件读取。命令及报告明确原始手机附件来源仍未解释，当前快照只作本次保全预期。

本任务不运行ADB、登录、网络、三端、构建或发布；作者/审阅不读私有正文、数据库或grant。父级完成独审与完整整合后，仍需有效原QA授权和真实CELLULAR/WiFi条件才能实跑。旧取消/登录/同步失败不重分类，不创建新的净化历史或远程仓库。

## 设备外用例要求

| 用例 | 预期 |
| --- | --- |
| 暂停首样本读取已超过3秒 | 保留至少2样本要求，继续第二次；原状态/数据断言仍执行 |
| 暂停第二样本落在29999ms／30000ms | 前者满足条件可接受，后者拒绝；不再发下一轮读取 |
| Mac二进制或安装APK SHA不符 | enable/同步/测试笔记写入之前停止，不重新标注来源 |
| QA username正确但subject与已提交历史不符 | 停止；不能仅凭三端相互相等接受新owner |
| 任一端已enabled／有错误或不支持的原始条目 | 不进入baseline后的同步或写入；不自动清错/登出/暂停制造前提 |
| 当前手机完整快照不符／附件引用或字节不符 | 停止，不生成新的可接受baseline，不覆盖旧证据 |
| 两端同ID原始笔记或附件存在语义差异 | 启用前拒绝，保留双方来源；不自动解决冲突 |
| 语义metadata变化／原笔记或附件遗漏 | 合并后及最终保全检查失败，不以新测试笔记收敛掩盖 |
| 仅投影revision或不同端受管relativePath变化 | 明确正规化后可比较，其余所有字段/ID/引用/原字节仍匹配 |
| 中途用例失败及最后保全失败 | 原始失败与保全/cleanup分别记录，有界释放owned资源，不能整体PASS |

上述fixture只能证明执行器契约，不构成真实账户三端或中转通过。实际用例仍由父级按准确候选及新鲜输出执行。
