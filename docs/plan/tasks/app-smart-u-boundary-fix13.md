---
id: app-smart-u-boundary-fix13
scope: U-F1 draft addition and U-F2 strict combine rejection
status: in-progress
depends-on: [app-smart-u-platform-ui09]
---

## Problem and baseline

固定候选d576b50d3e72f4a85a16dcda1852c787d868d870已独审blocked，见[原报告](../reviews/app-smart-u-platform-ui09.md)。U-F1为tags/date两种占用提前禁+且缺pinned构造；U-F2为String(combine)接纳数组并将非法all按ANY求值。保留该报告与全部失败，不重写成通过；修复只针对两项已证问题，不扩大规则能力、改原版政策或开展删除实验。

## Required behavior

- 草稿按tags→creationDate→pinned菜单顺序找首个未用且可表示的类型；在点击行之后插入。两种占用且第三种未用时+必须可用，三种全占才禁用。新增类型和按钮可用性消费同一能力判断，避免再出现不同分支。每行当前值、其他行草稿和token缓存保留。已用类型禁用、单行减号禁用继续保持。
- 创建日期/today仍仅为unsupported草稿，三行不能伪提交；提交拒绝并保留草稿，改成合法规则或移除不支持行后才允许真实保存。严格持久schema仍仅tags/pinned和原数量限制。
- combine必须是原值为string且严格等于all/any；不使用字符串强转接受数组或其他JSON类型。对同一非法JSON，TS和真实Rust均拒绝，合法all/any的原真值不变，不放宽Rust以迎合前端。两个已证数组反例进入共享corpus；保持闭合字段/版本/类型校验。

## Scope and verification

允许src/smart-draft.ts、src/SmartFolderForm.tsx、src/smart-folders.ts、docs/fixtures/smart-projection09.json及必要两项既有检查scripts/check-smart-{contract,ui}.mjs；新增证据仅docs/verification/app-smart-u-boundary-fix13/。不改Rust生产代码、Editor/媒体/归档/通知协议/依赖/锁/样式或其他模块。若发现额外产品问题回传root，不顺带修改。

用真实挂载生产表单复现第三行：tags+date时可增加pinned、按点击行之后插入、三种全占禁+、date仍拒绝且不丢稿；同时测试移除已占类型后重新可新增。共享corpus覆盖非法数组combine，实际TS parser和临时Rust Session一致拒绝；合法all/any混合facts保留区别。复用独审失败探针作为回归，不改独审原文件。必要一次共享Rust corpus窄测试可用现harness/target，实际Rust生产字节不变，不重复宿主check/全Rust或完整九组，仅在失败/额外变更有依据时拓宽。最终稳定源码pnpm build及diff检查，所有新失败保留。

作者完成前目标独占；每条600s、locked/offline、jobs2、≥2GiB，无GUI/ADB/用户库/平台构建/下载/清缓存。最终source identity逐项核查，说明与旧Rust/transport的准确对应。SOURCE-READY STOP释放target，root固定commit后交不同作者按新准确源复验U-F1/U-F2及必要受影响路径；通过前不构建平台包，不关闭U/F17/总目标。
