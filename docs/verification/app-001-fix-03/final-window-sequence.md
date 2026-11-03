# 有限真窗补验协议与身份边界

候选 `d9a5be5`，生产行为 `b5dcfa8`。先前 Mac 锁屏恢复后，d9 的 P1 与 Q4 有限序列已实际执行，证据见 proof-mac/final-d9a5be5/；副本进程退出后的SQLite只读重开通过，逐份应用冷启GUI留独立复验。最终20包仅增加安全UUID兼容，同源专用包另列身份，不把d9运行冒充20运行。默认交付包已恢复；额外专用包位于 `/private/tmp/notes-fix03-proof-d9a5be5.app`，身份见 `proof-mac/identity-final.json`。禁止把当前仍运行的旧 `fe10c3a` 专用进程当作新候选。

解锁后先通过原生应用退出旧进程，归档 `/private/tmp/notes-fix03-proof.jsonl`（此轮仅是旧包启动日志）。使用新专用包重新启动；记录启动 AX 与固定面板存在，确认实际可执行文件 SHA256 后开始。每步均以真实 AX、日志 ACK、请求与 operation ID 判断，不使用固定延时假定队列状态。

## P1：旧 pending 链不能被 focus snapshot 重基线

1. 在合成测试文件夹创建普通、无附件、未锁定笔记 N，正文含唯一 PUBLIC 标题与 BASE 标记，实际保存。由显式菜单打开同一 N 的真实独立窗 W2。记录两窗 runtime label、noteId、初始 revision r。
2. W2 点击“暂停下次保存登记响应至prepare”，用原生正文输入加入 LOCAL-A，再继续 LOCAL-B。等日志 `registration-held-after-real-result`：真实登记已经执行，其原样结果尚未交付，队列仍等待 ticket；记录 requestId 与 pending editor 内容。不得把暂停改到 action 参数已经构造之后。
3. 切 W1，在同一 N 保存 PEER-X，等待真实保存 ACK，记录 revision r+1。切回 W2，让真实 focus load_workspace 完成并由 gate 接受；编辑器仍保留 LOCAL-B pending。这个步骤必须发生在 W2 首个实际 save 构造 revision 之前。
4. 切 W1，通过真实原版式菜单请求给 N 设置锁。prepare 触发固定适配器释放登记结果。记录 W2 后续 A/B 请求的真实输入 revision 仍是 r；它们被真实 Store 返回 conflict，不能把 X 改为 A/B。W2 失败 ACK；W1 锁定操作 abort，N 保持未锁，pending LOCAL-B 保留。
5. W2 普通“重试”仍以 r 发送、仍 conflict，不能隐式重基线。切 W1 再可信同步，确认 PEER-X 与已确认 revision/正文未变。
6. W2 明确选择“将本窗口内容另存为新备忘录”。记录 `recoverConflictCopy` 真实成功、新 noteId、revision1，以及可信快照同步。副本含 LOCAL-B；原 N 仍含 PEER-X。确认副本持久后原 pending 才清除；再实际退出并重开验证两份内容。此行为是项目工程恢复契约，不声称原版已采用。
7. 锁定源/含附件源恢复已由真实 Store 测试明确拒绝；若补 GUI，只核对错误与 pending 保留，不绕过保护创建明文副本，不迁移附件归属。

## Q4：真实过期结果拒绝与漏 commit 恢复

使用现有合成锁定笔记 N（`FIX03 Public Q1` 可用），只用 fixtures 说明中的合成密码。

1. 正确解锁，在 W2 点击“暂停下次读取响应至commit”；通过系统 Window 菜单切 W1 再 W2，引发真实 focus load_workspace。等 `execution-complete` 后的 `read-held-after-real-result`，记录同一 requestId；W2 应被同步 cover 遮挡。
2. 切 W1，设置内“关闭所有已锁定的备忘录”。记录真实两窗 prepare/ACK/commit。commit 才释放原读取；必须出现同一 requestId 的 delivery 后 `gate-rejected`，不能只从最终锁屏推断丢弃。
3. 切 W2，点击“记录DOM”；保存截图和 AX，确认 editorCount0、hasPrivate false，新鲜读取被 gate 接受且界面仍锁定。Cmd+Z 不恢复旧正文。
4. 再正确解锁，W2 点击“丢弃下次commit通知”，切 W1 关闭锁会话。固定日志 `commit-delivery-dropped` 应在 W2 尚未聚焦时记录 covered true。不得为了截图先聚焦 W2 再声称这是未聚焦状态。
5. 切 W2，可信 focus snapshot 完成后记录 gate-accepted 和 DOM；仍无正文/编辑器。保存实际日志、AX 与截图，再归档固定日志并退出专用包。

结束后重新打开默认交付包并核对无验证面板、正式身份 hash。将真实执行结果追加为单独证据，未执行的步骤继续保持 not-run；不要覆盖旧 `run-before-verdict.jsonl` 或冻结 fixtures 的原始缺陷证据。
