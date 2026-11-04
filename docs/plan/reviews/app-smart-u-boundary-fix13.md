# APP-SMART-U-F1/F2 窄修独立复验

**结论：pass（仅 U-F1/U-F2 修复及其必要受影响边界）。** 准确源码 `8e8fe7e320e34a2b9c27bf7c7e794662ad988da4`，审查相对旧产品 `d576b50d3e72f4a85a16dcda1852c787d868d870` 的六文件差异。没有新确认的 P1/P2/P3 blocking 或 non-blocking finding。原 `app-smart-u-platform-ui09.md` 保持原固定版本的 blocked 历史结论；本报告不覆盖旧失败证据，也不代表整体 U、F17、设备或像素验收完成。

## 修复与证据

### U-F1：新增类型与按钮可用性一致，原反例已通过

`src/smart-draft.ts:80–98` 新增 `nextDraftRuleType`，按 tags、creationDate、pinned 顺序找首个未使用类型。`addDraftRule` 与 `src/SmartFolderForm.tsx:744` 的禁用条件消费同一 helper；两种占用时仍可新增第三种，三种均占才禁用。新增使用实际点击行 key 后的位置插入，不以菜单创建顺序排列。新 key 取现存最大值加一，避免连续新增共用同毫秒 key；没有修改其他规则或已有 token cache。日期仍使用 draft-only 的 today 分支。

原独立失败脚本 `app-smart-u-platform-ui09-independent/check-extra-ui.mjs` **文件不改、直接运行**，只将输出放到新独立目录。`browser01` 确认 tags/date 两行加号均 enabled、pinned 未占用，再从第一行增加得 tags/pinned/date，exit 0。旧 d576b50 的失败结果、截图和报告完全保留。

`browser02` 实际挂载生产表单、bridge 和真实临时 Rust Session，独立重跑已审读的扩展场景：

- tags/date 两种占用时加号均可用；第一行后插入 pinned，得到 tags/pinned/date；三种均占后全部加号禁用。
- 其他行已占用的类型 option 禁用；原名称、A token、置顶 true、日期 today 均保留。
- 有日期时点击“好”明确拒绝，三行、名称、token 不丢；真实 Rust 工作区没有 smart 定义，前端 createSmartFolder 请求为零。未放宽持久 schema，也未跳过日期偷偷保存。
- 删除日期后恢复新增；从首行重加日期位于 tags 与 pinned 之间；再移除 pinned，从日期行后重加 pinned，顺序正确，已有 token 保持。
- 最后移除日期，tags/allSelected/A + pinned/true 经真实 Rust 保存成功，权威工作区中存在该准确两条定义。

生产 draft contract 另覆盖三种表示逐个移除后重新新增、其他行值不变、唯一 key、仅单条原有规则不变，以及移除日期后可生成合法严格查询。原单行减号禁用逻辑未改。

### U-F2：原值严格枚举，数组拒绝且合法真值保持

`src/smart-folders.ts:32–33` 直接要求 `typeof q.combine === "string"` 且严格等于 all/any；`:69` 原值已经被收窄，不再靠类型断言返回。Rust 生产校验没有修改，原闭合字段、版本、数量、rule/entity 校验保留。

原独立 `check-extra-contract.mjs` **原样运行**为 `contract01`：`combine:["all"]` 与 `["any"]` 现在 TS 和真实 Rust Session 均 `smart_invalid`，不再进入错误 ANY 求值。原输入、TS error、Rust 请求/响应均保留在 `contract01-data/results.json`。

共享 corpus 明确加入这两个 invalid JSON，并增加同一 tags/anyTag + pinned/true 规则的 all/any 查询。生产 TS `contract02` 30 项通过；真实持久 Rust `rust01` 对该同一 corpus 的 14 个合法查询和 12 个非法查询全部通过。独立 `contract03` 另直接对四组已知 facts（无标签/置顶、有标签/非置顶、两真、两假）分别运行相同规则的 all/any，8 个值通过：前两组 ALL=false、ANY=true；两真均 true、两假均 false。这确认修复拒绝非法数组时没有合并合法 all/any 的原真值。

## 源、构建与运行身份

manifest `docs/verification/app-smart-u-boundary-fix13/source-identity.json` 的 SHA-256 为 `0940c3cb398ae82cf703f60136dbaa10614975d77f08f99fa7532e8dc3ce59ad`。独立核对 466 项当前文件、准确 8e8fe7e 的 git blob 与 manifest 均一致；每个实际检查前后无变更。六文件差异仅涉及三个已批准产品模块、两项检查脚本、共享 corpus。既有 Rust/配置保护范围及 Editor、样式、媒体/归档/metadata/access 协议、依赖/锁均未变化。

复用 transport `src-tauri/target/debug/notes-u-session-transport`，SHA-256 `943c2aa1a53828087037cdcec3ebf4f9db68aecef13d2fd35076d4450a344fd4`。本轮 Rust corpus 测试由既有 production module harness 运行，未重编平台包；实际 transport 的生产字节不变。

独立核对作者最终 `build01` 的 sourceBefore/sourceAfter 与当前 466 项 manifest 全相同，退出 0、3.411s；TypeScript + Vite build 成功。当前三项 dist 产物的 hash 与该 manifest 一致，CSS 未变，既有 bundle 大小提示保留。记录见独立 `build-identity-check.json`；没有为复验重复无变化的 build/host check 或完整 Rust、完整九组 UI。

| 独立运行 | 结果 |
| --- | --- |
| contract01 | 原非法数组两端探针原样通过，0.281s |
| browser01 | 原第三行探针原样通过，2.338s |
| contract02 | 生产 TS corpus/entity/draft/projection 30 pass，0.335s |
| rust01 | 实际持久 Rust 共享 corpus 窄测 1 pass、81 filtered，0.501s |
| browser02 | 实际第三行/插入/used types/拒绝保留/移除重加/真实保存 1 pass，2.800s |
| contract03 | 独立合法 all/any mixed facts 8 值通过，0.229s |

全部六条命令 exit 0，无本轮新失败；准确命令、输入 hash、完整结果、截图和原始 transport rows 位于 `docs/verification/app-smart-u-boundary-fix13-independent/`。`final-source-check.json` 同时核对旧 53 项独立证据未变，旧 blocked 报告及旧 evidence-index 仍与 `677e828` blob 相同。只新增本报告和新独立证据，未改产品、作者脚本/证据、任务/index，未 stage/commit。

## 限制与释放

本轮限于两个修复及必要受影响路径。受控 browser 仍仅替换 native transport 交付与测试观察，真实 App/Editor/bridge 请求进入真实临时 Store/Session；它不证明原生 toolbar、真实设备输入法、多原生窗口 IPC、手机 Back/安全区或像素一致。既有 d576b50 的九组及 O 接收边界通过事实保留在原报告中，本轮没有把未重跑场景声称为新版本完整实机通过。

未操作 GUI、ADB、用户数据库、正式包或原版删除实验。locked/offline、jobs2、每条 600s、可用空间最低约 70.0GB；无下载/升级/清缓存。所有已启动 runner 完成并通过 finally 结束页面/浏览器/Vite/listener/Rust 输入。

**STOP；共享 host target 已释放。** 两项源码阻断已在准确 8e8fe7e 上解除；后续准确双端包、设备与像素任务仍由 root 单独 START，不在本次窄修 pass 范围。
