# APP92 Mac 系统备忘录只读导入

状态：in-progress。用户新目标为Mac客户端直接从系统备忘录复制数据，不能破坏源数据。

契约：[Apple Notes导入](../../architecture/apple-notes-import.md)。先以本机脚本字典和实际只读研究确认正文/附件读取能力，然后开发/不同代理独审/主线整合/准确Mac30。既有同步功能及Android包不回退，原Android13秒现场不操作。

研究工作树 /private/tmp/apple-notes-import92-research；实现工作树 /private/tmp/apple-notes-import92-develop；基线4c597db6。研究和开发仅各自提交，root文档/派发/合入，独审由不同代理负责。研究阶段可并行准备源无关的UI/存储接入，但源协议冻结前不得以猜测替代真实能力。

## 接线验收

| 实际调用链 | 必须证明的结果 |
| --- | --- |
| 设置数据页→bridge→原生扫描worker | 仅Mac入口、可取消、错误分类与迟到响应隔离 |
| 固定只读源适配器→私有暂存 | 层级/正文/日期/CID协议、附件副本、超时与权限分别报告；源前后保持 |
| 暂存→安全转换→Store追加事务 | 真实schema、受管附件/原始记录独立文件、无源路径依赖、原有数据/设置保持 |
| 成功记录→重复扫描/源内容变化→重开 | 相同内容跳过、变化另建副本、成功ledger与目标共同提交 |
| 导入期间→Session/编辑/录音/同步边界 | 正文安全提交、忙碌隔离、取消/异常无伪成功或悬挂状态 |
| 实际App DOM→完整流程→真实Store | 入口/预览/开始/结果可操作；synthetic OS边界与真实Apple Notes集成分别记账 |
| 合入源码→Mac30→独立核包 | 动态产品输入清单、内嵌前端一致、原生新命令和系统权限说明存在 |

2026-11-07研究阶段：原多项读取55秒、单项账户数量15秒均超时，失败保留。随后AppleScript账户数量0.152秒及显式JXA accounts() 0.098秒成功；初始running()/collection.length桥接写法需修正，不能把原超时归因权限拒绝。正文/附件仍在探测，只结束自有脚本，不终止Notes；真实源集成门槛仍开放。


## 最终整合进展

主线 Store/host/UI/源重复归一化及最后段落空白修复均已不同代理独审合入。最后格式原3例修复通过且旧代码对照全部失败。当前精确源码 `7a602cca`（产品 `a8bc2452`）的相关 Rust28通过/真实源1默认ignored、类型检查、Vite、生产排除、新lean与实际App DOM20项全部自然0，见[最终整合](../../verification/apple-notes-import92/final-integration/README.md)。

实际来源 real02 已导入1、重开、相同内容跳过并核对源前后采样字段；其旧段落结构问题保留，不能追认为修复后结果。正在使用保留私有快照和新精确 binary 离线核对六块结构，不新增系统读取。Mac30 driver须显式传入 Apple Events entitlement，最终实际签名和用途文字由不同代理独立核包。尚未出 Mac30，不更改已交付 Mac29/Android21。
