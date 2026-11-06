# APP-SYNC86-ADAPTER 生产接线及安全应用协调

状态 in-progress，depends-on 84与85已独审并合入、主线完整回归通过（UI86已合入，frontend协调并行）。用户完整同步目标尚未完成。本任务实现由develop代理，独立verify不同作者，根负责合并/整合。

objective：创建真实SyncService、注入生产Store/Session backend、实现真实sync_command UI契约，连接持久收件到安全apply与metadata/access，做两真实Rust进程/两个真实App页面端到端，禁止stub/fake残留。读[架构](../../architecture/sync.md)、[UI IPC契约](../../ui/sync-settings.md)、84/85实际冻结API，必要设计先补文档。

path：src-tauri/src/sync/adapter.rs及子文件、lib.rs/setup/commands生命周期、session/synchronization.rs和Session必要字段、生产模块入口/Cargo依赖、Android备份配置；scripts/debug/rust真实生产同步headless和对应驱动。前端network-sync/App/bridge/attachment-target归86 frontend作者，不可交叠修改；UI86已合入，不重做。

## 注入与默认行为

run/setup创建共享Session和惰性Sync runtime state；status不启用Store、不生成密钥、默认不监听。显式startHost将Store sync_enable与85 identity绑定；pair只有Noise认证成功后Prepared→幂等Store adopt→Ready，崩溃重启可恢复，已有不同workspace明确拒绝并保留库。恢复持久已启用配置时自动重连，stop持久paused并关闭socket，resume恢复；app退出停止属于自己service。WebSocket后台不持Session锁；backend只短临界区取snapshot/写inbox，required_blobs先完整调用84wire字段/摘要/归属/预算验证再分配任何媒体，blob socket先独立stage再本地File publish，读取时锁内取安全本地路径、解锁后File读取，不能让对端给任意路径。UI sync_command采用deny_unknown_fields、固定type白名单，无任意IPC/path，检查本机expected Token和真实window。

身份secret不进入settings/archive/log；核对Android系统自动备份避免把完整device identity复制到另一手机导致counter碰撞，使用受支持的本地排除/allowBackup配置，项目手动归档仍保留。UI字段与docs/ui/sync-settings.md对齐，状态错误安全且收件durable与业务applied分别呈现。metadata来自真实Store commit receipt，非网络内存计数假造。status里pendingCount/conflictCount来自持久Store，失败不伪报同步成功。

## Quiet apply两阶段

84契约预期sync_receive只持久inbox；sync_plan_apply(excluded)->SyncApplyPlan{generation,excludedNoteIds,eligibleDigests,targets,changes}；sync_apply_plan重验generation/targets后事务固化dirty+merge+投影。采用实际84等价API可以，但不得绕安全屏障。

1. 收件触发或周期worker发现pending。收集当下所有真实document participants；向窗口发独立notes-sync tagged probe/prepare事件（精确字段见[固定协议](../../architecture/sync-coordinator.md)）（不能用现notes-access prepare）。窗口同步报告保护noteIds：真实editor.view.composing/TagComposition.pending、picker/attachment in-flight、活跃录音ticket owner、退出/创建/现access barrier状态。probe不设Session.pending，不改变授权/全窗cover/selection，不pause或close录音，不合成IME end。
2. plan排除上述owner；有excluded时暂缓所有folder，仍允许独立note B更新。最终plan targets包含所有目录派生note，不只本批entityIds。无eligible时等待安全点；状态显示已收待应用，不能忙循环。
3. 发prepare包含operationId/sessionId/noteIds（84 plan generation保留本机不交peer）。窗口再次检查真实保护集，忙则返回deferred；安全时短暂freeze目标editor与其所有native/toolbar/keyboard写入口，保留editor/view/DOM/selection/Undo，flush现有队列（仍允许已注册保存完成），然后ACK。probe/prepare分别最多5秒；超时/窗口增删/用户navigation/新composition均abort，后端线性化取消并返回终态收据或release后才释放前端freeze，inbox保留。此时不设既有Session.pending，允许IME/附件最终保存路径；freeze失败不能声称ACK成功。
4. 所有窗口ACK后在Session mutex短gate内校验live participants完全相同、无目标saveIntents、无access pending，84计划generation/heads/dirty/targets仍相符。stale重新plan/prepare，不覆盖旧context。网络IO已结束，只有本地事务/已校验File发布。原debug Rust transport复制current/store时须同时接入current/sync.rs/model子文件和sha2/fs2新依赖，避免旧真实Store设施失效。
5. Session用capture_commit包apply，事务后发布真实metadata。普通正文/置顶/命名不无谓bump noteEpoch；锁定、删除、sealed切换才撤销对应keys/intents、增加目标noteEpoch并发可信access snapshot。hydrate有变化目标可更新，其他editor/Undo不得重挂。回传commit/abort后各窗口恢复自己的旧editable与focus，不抢当前其他页面焦点。不能把normal abort显示成“锁定失败”的全窗error。

录音A在ticket生命周期直到最终document/journal ACK+release前始终保护其owner和目录依赖；暂停保存checkpoint不等于可以外部替换A。B的真实lock/delete导致全局epoch增加时，以新可信snapshot证明session/noteEpoch/owner/editor/document/externalVersion不变，允许A attachment/recording target重绑全局epoch；noteEpoch或任何实际owner/document变化仍拒绝。不得为方便测试删授权检查或把A改挂B。

## 验证

先两个独立Rust进程临时SQLite，生产84+85+adapter、真实socket：A创建→B修改→A收敛、多端转发、同/不同实体离线、media/locked、delete/restore/purge、100次重放/同向量异内容、丢ACK/SIGKILL与原目录重启、blob中断、错密钥/跨workspace/撤销/预算。网络测试控制仅本机stdin，不暴露debug网络RPC。

再两个真实App DOM各自独立Rust transport：A普通输入pending期间B更新、真实PM composition（不能只dispatch空event）settled后保存、原editor/view/DOM与Undo保持；录音合成A期间B普通修改及B lock/delete，A仍可连续checkpoint/最终保存到A，A本身远端更新待正常release才应用；附件picker/ACK同理。精确记录哪些路径来自真实Rust，JS fixture不能替代。原Android录音现场不动，真实麦克风不用。

新模块通过后才根主线一次受影响整合；保留原始失败，修正后只恢复相关边界。全部同步目标包括87路由和实际新Android运行/包验证，单adapter测试不标goal complete。

未启用库首次pair必须先创建可恢复本机device/Noise身份，再构建backend；其workspace查询在adopt前不得假称已启用。仅Noise成功Prepared后调用84可指定device的enable/adopt入口。Store已启用时用Store device打开85 IdentityStore，严格拒绝文件身份漂移；status无副作用。冷启失败pair也可恢复相同本机UUID；不通过读写私钥JSON猜字段绕85身份API，需要公共只读加载入口时由85所有者明确增加并复验。

实现分工细化：本任务作者拥有Rust adapter/Session/lib/生命周期/真实Rust与headless测试；前端quiet接线由[86 frontend](app-sync86-frontend.md)独立worktree并行开发，均遵循[固定窗口协议](../../architecture/sync-coordinator.md)，避免两人改App/bridge同路径。生产整合及独审必须汇合两者，不能只backend或只fixture验收。

### 本机真实Rust transport接线（86实现接口）

`notes-current-attachment-transport ROOT`继续用逐行stdin JSON请求与逐行stdout JSON响应：`{requestId,window,command,args}`→`{requestId,ok,value?,error?,events:[]}`。新命令`sync_command`的args为`{command:<UI discriminated union>,expected:<Token>}`；`sync_window_reply`为`{reply:<固定probe/prepare union>,expected:<Token>}`。两者实际调用生产Runtime/Session/Store。`sync_command`由独立本机线程处理，pair不阻塞stdin读取；requestId关联乱序响应，客户端pair timeout至少35秒。

`set_document_participants`的args为`{windows:["main","note-…"]}`，替换测试进程的真实本机窗口集合（最长64，唯一且只允许main/note-前缀）；由App DOM transport明确登记/注销，不从peer消息取窗口身份。`poll_events`的args为`{}`，返回`value:null`、`events:[{name:"notes-sync"|"notes-access"|"notes-metadata",payload:…}]`，原子排空异步事件队列。调用其他命令时也可带回已排队事件；客户端需持续并发poll，不能等pair或sync命令返回才处理probe/prepare。生产App使用AppHandle的实际document_participants和Emitter，不用这些测试命令。

`headless_apply`仅stdin测试runner提供：必须先把participants设为空，显式调用才执行生产Store计划/应用；有窗口时明确拒绝。生产网络backend永远只receive inbox，不调用该命令或apply_pending。普通现有attachment transport命令保持原参数和响应。该本机stdin控制不对网络暴露，不替代真实PM/录音/窗口生命周期证明。

### Rust实现范围与交付边界（86 develop）

生产入口已接入惰性Runtime、AppHandle真实document participants、独立quiet状态与退出/前台生命周期。backend在完整wire/seen/inbox/附件归属预算校验后才允许分配blob；hashing、读File与发布File不持Session锁，receive仅写durable inbox。quiet的probe/prepare不设置access pending；最终Session gate重新检查窗口集合、epoch、目标save intents与Store计划，然后用真实commit receipt发布metadata及必要access撤权。resolve等待真实commit/abort终态返回。

临时文件上限遵循主线规格提交`0f95545a`：network staging最多3文件/256MiB，串行Store capture staging最多1文件/256MiB，总计4文件/512MiB，单blob最多256MiB。network发布校验受控stage路径、File身份、SHA256与磁盘预算，使用跨进程文件锁串行发布，直接rename已验证File；已有损坏cache必须报错，重复有效发布幂等。Android系统备份配置排除identity所在私有数据，手动归档契约保持；Android编译/设备运行由后续整合验证。

已有业务明确禁止含附件note加锁，也禁止locked note添加附件；locked wire的空document与附件引用一致性同样排除locked+media。本实现不扩展此schema、不引入alias或放宽验证。真实进程分别验证plain图片/音频并发keep-all与locked文本并发keep-all；locked+media只验证现有拒绝边界。

本作者验证使用独立临时SQLite与生产socket/Noise/Store/Session，没有真实用户库、真实麦克风或设备操作。原Android未保存录音现场未触碰。独立双App DOM、UI录音/picker生命周期、87路由与新Android包/实际运行仍是整体交付门禁，单Rust adapter回归不能代替它们。完整命令、自然退出与故意SIGKILL、原始失败和修正后结果记录在`docs/verification/sync86-adapter-author/`。

双App DOM所需stdin命令另接`register_recording_local`、`recording_local_validate/started/revision/release`，参数与生产Tauri命令一致；builder按唯一源码边界提取`recording_window.rs`的纯registry代码原样编译，若边界变化立即构建失败，不维护另一份录音算法。`workspace_action`对lock/delete等真实barrier使用独立线程发送`notes-access prepare`，等待实际窗口`acknowledge_access`，再由同一Session的`finish`产生终态与metadata；不自动ACK。实际OS窗口关闭/退出仍不在该stdin证明范围内。

冻结`10cd8326`后的完整回归保留了两个失败：旧网络quota fixture按4文件构造，与主线3文件正式规格不符；invalid blob测试发现首次发布锁文件在失败输入后出现。后续最小修正将fixture改为正式3文件，并在启用/已启用恢复时初始化稳定发布锁，使损坏blob失败保持原文件快照；status仍不启用Store或创建identity。追加stdin wrappers、回归修正与它们的最终验证使用后续冻结提交，不能把`10cd8326`已有通过结果追认为追加范围已验。
