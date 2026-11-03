---
id: app-001-fix-03-mac-01
task: app-001-fix-03
baseline: 20c3014
result: final-source-limited-production-and-timing-regression-pass
date: 2026-11-03
---

# FIX03 最终同源 Mac 独立有限验收 01

**最终20c3014在真实Mac窗口完成生产Q7/Q1有限链，以及同源专用包的Q8、早登记A/B冲突与副本、Q2成功排空、Q3失败中止、Q4晚读拒绝/漏commit恢复。没有发现新的P1。默认包已完整恢复，冷启动后副本与源正文分别正确。** 这是本轮有限安全门槛证据，不是F12/F13全矩阵或整个应用/像素一致通过。四份密文GUI导入、S3非ACK集合旧保存、Editor对象identity等仍保留unknown/not-run，不用开发d9结果代替20独立结果。

## 真实身份及工具中断边界

生产默认Mac executable为14,651,952字节，SHA256 `904517fc6e23ffb47c4b380db4546b2585625c5e586c22e44aeb1c61dc55ed1b`。开始实际进程73159，路径为仓库`src-tauri/target/release/bundle/macos/备忘录.app/Contents/MacOS/notes-clone`，默认无proof面板。

同源专用包executable SHA256 `2fe4ae34b98fe622abe3d47143b3d72bb3d2e47726c060631cb81bcf3e3f9a53`。第一次从`/private/tmp/notes-fix03-proof-20c3014.app`启动PID74574后，CUA同bundleID解析意外启动默认PID74663，后续选区观察命中了另一窗口。该次请求/观察保留在`interrupted-*`，**不计通过或失败**；释放其挂起请求、系统Quit两个进程并确认零实例。

经主任务明确授权，完整默认.app可逆移存`/private/tmp/notes-fix03-default-preserved-independent20.app`，核hash后把冻结proof完整复制至已知正式路径，唯一测试PID75144，避免同ID多路径解析。该阶段明确属于专用包，不冒充默认行为。重新分离日志，新`proof-run.jsonl`从seq1连续至266；只引用这份独立最终20日志作时序结论。专用包仅固定暂停真实请求执行/响应交付，及丢一次commit通知；不写React/编辑器、参数或返回值。

结束后系统Quit专用包并确认零实例，完整恢复原默认.app，hash再次等于904517fc…，冷启动唯一默认PID76021、无proof面板。恢复身份及备份/专用保留位置见`artifact-path-swap.json`、`default-restored.json`和`restored-process-identity.json`。

## 默认生产包真实窗口链

普通笔记N=`16d26e63-007a-47c8-b7a8-349857260862`，标题`QA FIX03 Independent20 Mac`。W1为原生主窗口“备忘录”，W2通过“单独打开”创建，AX实际URL为`tauri://localhost/index.html?note=N`；系统Window菜单确实列出并切换两个真实窗口。

- **Q7有限pass**：初始`PUBLIC-20-BASE`；W2真实键入` PEER-A-20`，切W1实际看到A；W1真实追加` MAIN-B-20`，再切W2实际同时看到A+B。没有把旧正文写回。中间一次CUA提示用户界面变化，B尚未执行；刷新后重新选专用QA文件夹和笔记，才执行B。未把未执行步骤算成功，也未修改误选的其他笔记。
- **Q1有限pass**：普通笔记加锁/正确解锁后，W2真实键入` PRIVATE-Q1-20-SAVED`；切W1实际读到该新保存。W1设置“关闭所有已锁定的备忘录”后，W2锁定页没有正文编辑器，真实Cmd+Z不复活历史；共享真实要求重新解锁。正确重解锁恢复A+B+PRIVATE全部内容。生产阶段没有额外运行时epoch/对象观察入口，prepare/ACK完整时序由下列同源专用链单列。

## 同源专用包的受控有限链

时序笔记T=`bd095f20-f857-46ae-bded-bc1705e025a9`，标题`QA FIX03 Timing20 Mac`。所有输入和另存通过CUA原生键盘/粘贴或真实按钮；只读日志来自真实Rust窗口标签。公开合成密码`FIX03-synthetic-only-2026`。

| 场景 | 实际证据与有限结论 |
| --- | --- |
| Q8选区/Undo/Redo | 主窗真实追加单字符D，save request `806830f9-8f8d-4db1-b20a-c6e53068caa2` 执行前held seq18；Shift+Left选中D，AX明确Selected text D；同request release19→真实保存rev53→54 seq21→gate-accepted23后AX仍Selected text D。实际Cmd+Z精确撤回D，Redo恢复D。未直接取得Editor对象identity，identity为unknown |
| 早登记A/B及focus基线 | W2标签`note-1793699768925`，第一份A真实登记request `ae99b047-f3f4-4c91-85ab-512c9967d1b6`在真实结果后held；第二份B真实排队。W1主窗真实保存X为rev57，W2焦点同步保留本地A+B而非覆盖 |
| Q3排空失败与旧基线 | W1closeAll的prepare op `44b0388c-e263-47ec-a7d4-58a9008908dc`，参与者真实为main和该W2；prepare释放早登记。A `86b99873-0ba0-4ce5-8808-ec7c61b12ade`、B `3129976f-0532-4c24-83aa-625833c7c499`均以旧rev56真实执行并conflict（seq95/98）；操作abort，无该op的commit。W1可见未保存导致关闭失败，W2本地A+B仍在；普通重试仍rev56 conflict，不能借hydrate推进覆盖X |
| 真实另存及冷保全 | 点击“将本窗口内容另存为新备忘录”成功，新ID `1986b341-eaf9-4304-9a62-32c203e8227f`、rev1。退出全部进程后只读SQLite新连接核该副本完整A+B、没有X；源仍独立，后来加锁的源密文封装无明文正文。恢复默认冷启动后GUI再次分别确认副本A+B、源X+Q2标记，未相互覆盖 |
| Q2正常→锁定成功排空 | 新真实W2 `note-1793700000555`保存` PRIVATE-Q2-DRAIN20`，request `2b61ee14-2d73-40aa-b71a-0970f0d3aab1` held155；W1真实lockNote prepare op `aabaad04-f0eb-4d0d-b502-4e258337da4e`→同request release171→执行172→真实rev57→58成功173→保存gate-accepted175→W2 ACK176–179→commit180/181，epoch1→2。锁定后正确解锁正文含排空标记。没有用sleep猜测在途 |
| Q4旧读及漏commit | W2真实焦点load_workspace request `8f6100a2-f80a-4803-99ac-77c7079f211e`执行成功epoch3 seq226、held227；W1closeAll op `717e833d-19d6-482e-bf4b-8183dc91c665`提交epoch4 seq247/248。W2故意漏commit，seq249记录covered=true（当时DOM editorCount1，仍有挂起编辑器，不把它谎称已卸载）；同read release250、delivery252、gate-rejected access_changed253。重新聚焦后可信epoch4 snapshot261–265恢复锁定，DOM记录266 editorCount0/hasPrivatefalse/coveredfalse，实际Undo不恢复正文 |

## 冷启动及还原

专用进程退出后只读核对的副本rev1与源rev59分别保存在`cold-source-copy.json`（只取精确合成标题行）。默认恢复后GUI冷启仍锁定源；正确密码恢复`PUBLIC-TIMING20-BASECD PRIVATE-PEER-X-20 PRIVATE-Q2-DRAIN20`。另选副本显示`PUBLIC-TIMING20-BASECD PRIVATE-LOCAL-A-20 PRIVATE-LOCAL-B-20`。默认生产N的冷存储也仅sealed、允许标题、空plainText，没有保存PRIVATE明文。

## 仍有限/未知的边界

- Q2/S3“不属于已ACK排空集合、commit后才执行的旧保存”未在本轮GUI执行；既有真实Session/Store过期epoch拒绝检查保持原有限边界，不升级为该时序通过。
- Q5四份冻结密文GUI导入没有新增执行。引用独立`ad9ea3d`真实生产Session/Store有限探针（合法富文档/绘画、两非法schema在发布key前拒绝、错误密码、密文及其他授权不变），不冒充GUI导入完成。
- Q6归档/附件/新窗口集合变化的全矩阵、直接全量派生缓存观察、对象identity、像素及输入法组合均非本轮结论。生产共享拒绝和专用DOM晚读边界已单列。
- Android最终同源有限流程另见`app-001-fix-03-android-03.md`；安全ID有限补审见`app-001-fix-03-android-02.md`；保存基线/副本真实SQLite失败和入口审查见`app-001-fix-03-static-02.md`。不重复Rust未变的无关矩阵。

证据目录`docs/verification/qa-fix-03/mac-20c3014/`包含AX/PNG、进程与产物身份、fresh266条时序日志、冷存储、15项有限断言及完整性hash。所有测试仅使用合成笔记，没有对第三方实际发送分享，没有导出私人数据、清空剪贴板或永久删除内容。原版Math Mode Reference建议结果勾选恢复未在本有限安全序列追加，留给后续极有限清理，不阻塞本轮验收。
