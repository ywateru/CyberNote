# FIX03 独立有限验收计划

日期2026-11-03；verify_app。**仅只读准备，全部not-run**。基于任务`app-001-fix-03`与已冻结夹具提交`cd00e1a`，不读取或验收开发中的共享未提交源码。本计划复用`docs/verification/app-001-fix-03/late-actions.md`的精确时序，避免重复整应用基础矩阵。

启动前须开发交出已提交最终源码、源清单/构建hash、同源Mac安装版，以及明确GUI交接；独立核对实际运行与安装来源。W1主窗、W2显式独立窗须为真实窗口，记录真实运行时窗口标签/标识、同noteId、来源URL，不以同一页面两个组件替代。仅导入/编辑冻结合成夹具及专用QA笔记，不读私人笔记，不真正发送分享，不清用户剪贴板。

只在明确合成数据范围验证敏感命令的拒绝：无授权时正文读取/保存/移除锁/文本复制分享来源均由真实Rust拒绝，不靠按钮禁用；不得为测试绕过授权去解密私人内容或外发文本。复制/分享用受控接收适配器观测是否收到内容，实际第三方发送保持禁用；用户此前已手动输出的系统副本不纳本次撤销契约。

| 有限场景 | 必须执行与证据 | 初始状态 |
|---|---|---|
| Q1 真双窗关闭/恢复 | W1/W2同一合成锁定笔记，正确解锁，W2编辑保存确认；W1关闭全部，W2即时卸载编辑器/历史，正文/预览/搜索/find/绘画目标无PRIVATE标记；焦点恢复/切笔记不回灌。新窗口启动取可信snapshot。记录prepare/ACK/commit、窗口集合、epoch/revision、截图+只读快照；重新正确解锁核对已保存正文 | not-run |
| Q2 排空成功与迟到保存 | 按S1在真实保存执行前设可观测暂停，prepare前排队保存允许排空，成功后ACK，全部ACK后commit；正确解锁确认标记。另按S3释放不在已ACK集合的旧epoch保存，真实后端拒绝，revision/密文不被改。普通→锁定边界至少一次 | not-run |
| Q3 排空失败 | 按S2用真实revision冲突或明确的受控IO失败；pending编辑保留，不能成功ACK/commit，发起窗可见失败，授权仍可用；保存重试成功后再关闭。禁止吞异常后把flush resolve当保存成功 | not-run |
| Q4 晚到读/漏事件 | 按R1在真实后端执行后、前端交付前暂停workspace/正文响应，撤销后释放，旧generation/epoch结果不得复活编辑器/历史/搜索。丢commit或后台恢复至少一次可信snapshot恢复；暂停点有requestId+arrival/release ACK，固定sleep不算在途证据 | not-run |
| Q5 四份解密后schema | 校验冻结fixture hash；外层密文导入可成功。错误密码不授权；valid-rich/valid-drawing正确密码完整解锁。invalid-structure/invalid-drawing-attribute正确密码在发布key/明文前拒绝，密文及其他授权保持，非法PRIVATE标记不进workspace/搜索。合法样本保存/关闭/冷启至少一次 | not-run |
| Q6 实时授权与归档 | 关闭后真实Rust新读脱敏/敏感命令拒绝，不能只看图标；归档仍只有sealed+允许标题，无PRIVATE正文；普通未锁笔记仍可读/搜索/保存，含附件笔记锁定限制保持。仅测指定合成内容，外发链不实际发送 | not-run |

冻结归档与合成明文位于`docs/verification/app-001-fix-03/fixtures/`。固定公开测试密码见该目录README，不能用于实际用户笔记；不重跑生成器覆盖随机salt/nonce与既有失败基线。两份非法样本必须同时区分树schema与应用drawing属性，不能只用“根是doc”替代。

测试控制层只负责暂停真实请求执行/响应交付或模拟明确IO失败，不能改写返回值、直接注入React/编辑器明文或代替Rust授权检查。若开发没有可复核暂停点，Q2/Q3/Q4相应分支记unknown，不以快速点击加sleep猜中时序；测试构建与生产安装版差异单列，生产真双窗Q1不可省。

每次记录seq、真实窗口ID、requestId/阶段、session/access epoch、revision、pending count、ACK结果、明文编辑器挂载状态与命令结论。截图只允许合成数据。输出未来放`docs/verification/qa-fix-03/run-<commit>/`，报告分别列真实GUI、控制时序、schema/后端与未知项，不把任一模块pass当完整F12/F13通过。
