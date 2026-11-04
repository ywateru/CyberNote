# APP-SMART-U 独立审查

**结论：blocked。** 固定源码 `d576b50d3e72f4a85a16dcda1852c787d868d870`，差异基线 `7513095e6a12937fae275e730aa4890a4eb47b9e`。存在两个已复现的 P2 blocking finding；没有确认的 P1 或其他 P3 finding。下列通过项不能覆盖这两个阻断问题，也不代表整体 Apple Notes、设备交互或像素验收完成。

## Findings

### U-F1 — P2 blocking：两种草稿占用即禁用新增，遗漏未使用的置顶类型

契约：`docs/plan/tasks/app-smart-u-platform-ui09.md:43` 指定按菜单顺序选择首个未使用且有草稿表示的 `tags → creationDate → pinned`，仅三种均占用时禁用加号；新增位置在所点击行之后。严格持久 schema 仍不接受日期，三行可以停留在未提交草稿中。

`src/smart-draft.ts:82–86` 的新增分支只有 tags 和 creationDate，没有 pinned；`src/SmartFolderForm.tsx:743–745` 在已有 tags 与 creationDate 时直接 disabled。实际从默认标签行点击一次加号后，两行加号均不可点击，置顶类型仍未使用，无法按契约形成第三条草稿或复现已采原版标签／创建日期／置顶的行结构。

独立 `browser02` 使用最终真实 App、bridge 与 Rust transport 挂载：类型为 `["tags","creationDate"]`，`pinnedUnused=true`，两行 `disabled=true`；预期加号仍可用的断言失败，exit 1。截图为 `docs/verification/app-smart-u-platform-ui09-independent/browser02-data/third-rule-boundary.png`，原始结果及日志均保留。修复应同时覆盖新增类型选择和按钮禁用条件，并验证在点击行后插入 pinned、三种均占才禁用、日期仍不能持久提交。

### U-F2 — P2 blocking：严格查询解析将数组组合值接纳为合法查询

契约：U 任务 `:14` 的闭合查询 schema、严格 TS 联合边界和 Rust/TS 一致求值。`SmartQuery.combine` 仅可为字符串 `"all" | "any"`。

`src/smart-folders.ts:32` 先执行 `String(q.combine)` 再验证枚举；`["all"]` 和 `["any"]` 因此通过。`:68` 的类型断言只改变静态类型，结果仍包含原数组。`matchesSmart` 在 `:158–160` 只对严格字符串 `"all"` 走 ALL，其余走 ANY。因此合法 JSON 输入 `combine:["all"]`、两规则 tags/anyTag 与 pinned/true，facts 为 tags 空且 pinned true 时，TS 接纳并返回 true，错误地按 ANY 解释非法输入。

独立 `contract02` 将同一 JSON 输入同时交给生产 TS parser 和真实临时 Rust Session 的公开 createSmartFolder：两种数组均 `tsAccepted=true`、`rustAccepted=false`，Rust 返回 `smart_invalid`；两个 mixed facts 结果均为 true。完整请求/响应、输入和值保留在 `docs/verification/app-smart-u-platform-ui09-independent/contract02-data/results.json`。该命令 exit 1，未视为可忽略 fixture 失败。当前 Rust 保护阻止这些定义写入生产数据库；finding 针对声称严格的前端接收边界及两端契约分歧，不声称普通表单已能造成 Rust 数据损坏。

同入口静态复查：`String(r.type)` 后仍有严格 rule 类型判断；`String(f.kind)` 后仍有保留 ID/normal 的严格 kind 分支；`Number(definitionRevision)` 前有对原值的 `Number.isSafeInteger` 检查；sortOrder/createdAt 也直接检查原值。version、mode、pinned 使用严格比较或 typeof；names 为数组且每项 validTagName 先检查 string。未确认其他同源 JSON 数组/数值字符串容忍点。修复范围应取消 combine 的字符串强制转换并将这两种非法输入加入共享反例，保持 Rust 不放宽。

## 源身份与实际验证

作者 manifest SHA-256 `e004f398ba3ededdd0e2ff5dc1ce7984e52591c18a3f5b2e1b345624af86e45f`，463 项文件与固定提交 blob、当前文件逐项一致，独立运行前后没有源变更。复用已冻结的 `src-tauri/target/debug/notes-u-session-transport`，SHA-256 `943c2aa1a53828087037cdcec3ebf4f9db68aecef13d2fd35076d4450a344fd4`。核对记录在独立目录 `source-identity-check.json`、每次 `result.json` 和 `final-source-check.json`。

作者最终 README 已准确分开 browser14 的九组行为验证与 browser15 的最终一组表单样式验证；后者不是最终九组的代替。本轮确实在最终 d576b50 上重新运行全部九组，另补三条有区分力的通过路径及两项失败探针。复核准确源的前端 build03、宿主 Rust check 和作者完整 Rust 记录；不因文档提交重跑完整 79 项或宿主 check。

| 独立证据 | 结果与实际范围 |
| --- | --- |
| browser01 | 最终九组真实挂载 9 pass，exit 0，7.387s：Mac 草稿/警告/唯一创建、CAS/latest reload、同 Editor/Undo、搜索取消/新建默认物理去向/移动候选/定义删除、手机分层确认、中文 composition 丢标签、peer 规则变化、收据后同步恢复、冷启/显式导入恢复、唯一置顶与删除定义保全 pending |
| browser02 | 新增第三规则路径 1 fail，exit 1，2.300s，U-F1 |
| browser03 | 新增 peer 规则失配与别窗偏好路径 1 pass，exit 0，2.381s：别窗持久设置导航、sort、theme 后更改规则，本窗 folder/base note/settings 保持，列表与有效选中投影到真实首篇，没有 settings 写请求，原 Editor 存活；规则恢复后回同一 Editor |
| browser04 | 最终源码 O 关键路径 2 pass，exit 0，3.046s：pending overlay 后较旧有效 ACK 排空并在相同已应用 sequence 重读新权威正文，revision 从原基线 1 最终收敛 3；撤权后旧 ACK 返回 access_changed、旧 Editor 销毁、正文不回填、applied 不倒退、不重复 save、原私有 pending 身份保持 |
| contract01 | 生产共享 corpus/query/entity/draft/projection 25 pass，exit 0，0.236s |
| contract02 | 2 个 JSON 数组 combine 反例均确认两端分歧；拒绝断言失败，exit 1，0.248s，U-F2 |
| rust01 | 公开 Session 智能 CRUD/CAS/物理所有权、智能归档公开导入/重开/导入文件替换为非法版本，2 pass、80 filtered，exit 0，0.238s |
| rust02 | 真实持久规则及合法 span facts 的共享 corpus，1 pass、81 filtered，exit 0，0.617s |

总计 12 个不同 browser 场景通过、1 个新增 browser 场景失败；25 项既有 TS contract 通过，另两个非法输入确认失败；3 项必要窄 Rust 通过。不将失败命令计入 pass，不覆盖作者或旧批证据。

## 代码接入与通过项的边界

- `session.rs:326–331` 的 ordinary 分发将专属 CRUD 接入既有 Session token/pending/metadata 收据链；`session/metadata.rs:72–99` 仍严格检查 token、拒绝 pending barrier，并经 Store capture_commit 与 tagged_core。智能删除没有走物理成员屏障。legacy capability gate 移除没有删除 Rust strict query/entity/archive 校验。
- `bridge.ts:178–181/210–214` 对原生工作区调用实体解析；前端 Folder 物理/智能联合、shared corpus 与真实标记 span 投影已接入。`projectFolders` 的同一 ids/count/firstId 同时用于列表、数量和进入选择，锁定/访问暂停事实保留未知或不合格处理。严格 parser 尚有 U-F2，不能据这些通过项宣布该门禁已全部通过。
- `App.tsx:799–834/849–889` 的被动 hydrate 保留本窗 settings，不调用 restoreSelection；显式成功导入在 `:1893–1902` 才恢复已映射的权威选择。browser03 独立证明 peer 并未误用导入恢复行为；browser01 的真实归档导入、失败路径和冷启恢复亦已在最终源执行。
- `App.tsx:1030–1110` 仍按本窗提交确认 revision/pending，不从旧响应回填正文，随后强制 metadata 重读。`projectedNoteId`、TagComposition 停车、SearchEditorHost 所有权未由智能规则变更重建；实际中文替换使真实 list/count 归零但保全活动组字，compositionend 后停车而不伪造成员。访问撤权继续优先失效。
- 表单用独立 draft/panel，取消不写、手机面板确认只合并草稿、上层确认才创建；CAS 冲突保留旧稿并显式载入最新值。保存有唯一 receipt 时进入仅同步恢复，不重复创建。U-F1 的草稿第三行边界尚未满足。

受控浏览器挂载真实生产 App/Editor/bridge，实际操作进入同一真实 Rust Session/Store 临时数据库；仅替换 transport 交付与增加观察 refs。browser04 的撤权施压沿用不交付 prepare、无参与者真实 commit 的有限场景，因此证明接收门，不能证明真实多原生窗口排空；原生 prepare 协议由源码及既有 Session 测试约束。composition 事件也不等于设备输入法。

本轮未操作 GUI、ADB、用户库或正式包；没有重开用户暂停的原版删除实验。Mac 原生 toolbar/菜单焦点、Android Back/键盘/安全区、真实多窗 IPC、完整本地规则、原版未证状态及像素级差异均不在本轮 pass 范围。源码 blocked 后，准确双端包与设备任务仍不可提前冻结为通过。

全程 locked/offline、jobs2、每条 600s 上限，最低记录可用空间约 70.0GB；无下载/升级/清缓存。runner finally 关闭页面、浏览器、Vite、本地 listener 和 Rust stdin。本轮只增加独立证据及此 review，未改产品/作者脚本/封存证据/任务/index，未 stage/commit。

**STOP；共享 host target 已释放。** 请作者围绕 U-F1/U-F2 窄修、封存新的准确源，再独立复核必要边界；本报告保留 d576b50 的 blocked 历史结论。
