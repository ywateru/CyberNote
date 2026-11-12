> 最终状态（2026-11-12）：接受 **desktop run07 / 35 checks** 与 **three-peer run05 / 4 cases**；三项工具P2已关闭。正式短报告：[/private/tmp/sync108-final-independent.md](/private/tmp/sync108-final-independent.md)。run06/run04为前版，以下早期open/pending结论作为历史保留；IME/in-flight保存竞态仍未形成完整覆盖。新增正式结构化核验见 `/private/tmp/sync108-final-run07-independent-evidence.json` 与 `/private/tmp/sync108-three-run05-independent-evidence.json`。

---

# 最新补充：sync-settings未提交尺寸断言修正

已独立只读核对，**有产品契约依据，未降低手机44px断言，未发现该改动的P1/P2阻塞**。产品共享变量明确桌面floor28/移动44，CSS以!important实施；Preferences class与共享变量均取同一mobile状态，故.closest('.preferences-mobile')可正确保留窄桌面/手机44px。layout JSON已在当前断言前保存，含minimumHit与smallButtons。

专项报告：`/private/tmp/sync108-sync-settings-contract-review.md`；字节观察：`/private/tmp/sync108-sync-settings-contract-state.json`。本次审阅的是主工作区未提交脚本，不冒称已审冻结commit；五个相关产品源与取样HEAD6c45119d一致。没有重复运行fixed02，正式双平台结果仍待主代理本地运行结束，旧失败继续保留。本补充不关闭下文其他工具P2。

---

# SYNC108 工具独立审阅：当前最终静态状态

冻结时间：2026-11-12T11:40:52.281445+00:00。**本节覆盖后附较早结论；“最终”仅指本轮静态审阅完成，不表示完整双端/三端验收通过。** 主代理目标路径仍为 `docs/plan/reviews/app-sync108-tools-independent.md`；本审阅仅写/private/tmp报告，不改仓库、暂存、源码、设备、进程或构建target。结构化状态：`/private/tmp/sync108-tools-independent-final-state.json`。

## 本轮结论

**未发现新的产品 P1。原恒真note-ID P1已修。工具总体仍有3项P2未关闭，完整验收未通过；PageLoad接线已静态完成，新binary/canonical manifest与正式Ready/完整运行证据仍待冻结。** 不把准备、部分业务步骤或协议fixture当成完整通过。

| 项目 | 最新独核状态 |
|---|---|
| PageLoad Ready模块 | Dewey `736469ee`，Mendel对应 `31347d60`。Native main Started将ready清零、清READY_ACCEPTED；Finished唤醒Condvar。有界等待真实Finished后，只读probe实际document，再等待debug注册/真实idle/startup解除，成功才允许普通动作；Shutdown可在未Ready时清理。未见伪造ACK或强制解inert。 |
| 现有回调接线 | 复核初期尚未接线；随后**Mendel `e3225038`已补齐** `lib.rs:623–624` 的同cfg调用，保留原media opened逻辑。此前“接线缺口”结论已关闭，不能继续报为当前未修。 |
| 默认/生产排除 | 模块与新调用均 `all(feature="sync-e2e",debug_assertions,desktop)`；page_load/start还要求owned env NOTES_SYNC_E2E=1。Android不编入该调用。只静态确认；本轮未做release编译。 |
| 页面/渲染诊断 | 4d5df08b/a7f4b52c只对owned测试窗口安排位置，并观测真实rAF/timer、有限DOM/phase。没有把计数当作保存或同步ACK；当前超时根因仍未证实。736的nativePageFinished phase已进入2ef1580b的Node白名单。 |
| canonical verifier | Dewey `2ef1580b` 把product/binary/dist匹配和实际执行Node工具分别记录；native Rust module散列还与manifest核对。Node工具允许与旧build工具不同并显式记录matchesRecorded，而不是假称相同或要求产品重编。 |
| 原native startup脚本P2 | **Mendel `46bde461`静态已修。** stop幂等，记录pre-exit/真实signals/forcedKill/timeout/errors；清理后finalize决定passed；lsof有界。作者保留tool-only五类反例和fresh native-startup01记录；本审阅只读交叉核对，未重跑。原2a34faf0报告作为历史审阅保留。 |
| Android新建输入归属 | 已补看ba1b6917/e755c722 helper增量：先回列表、限定mobile新建按钮、读唯一新ID、等待精确data-note-id编辑器与焦点，再Input。改善误写旧编辑器；includes每行仍只算保存就绪，完整document需正式编排精确核对。 |

## 仍开放的P2

1. **native关闭期间新fatal漏计**：截至Dewey `2ef1580b`，helper行240–273仍只在close起始复制this.#fatal；await closed后不重读。合法shutdown后截断PREFIX尾帧+exit0仍可能failureCode存在而naturalExit=true；suite亦只因close抛错设置cleanup失败。最小修复为完整pipe close后合并fatal，并加集成到NativeApp.close的截断尾帧fixture；不是只测FrameDecoder.end。
2. **Android重复close删后继连接锁**：已复核至 `e755c722`，helper行117–123仍无closing promise、幂等或owner token，每次rm固定锁目录。原A close→B接管→A再次close删B锁反例仍成立。只读review不接触手机或真实锁。
3. **浏览器startup pass JSON早于cleanup**：845f2181的desktop/mobile先写passed:true，再finally cleanup；cleanup失败可保留通过JSON。应清理后统一写最终状态，或正式消费至少同时核对exit0与清理结果。此项独立于已修复的native Python startup脚本，不可混称全部startup清理已修。

上述为工具可误判的缺陷；没有因此倒推现存某一轮确已发生相应误报。作者应修工具或在正式报告中提供独立检查补足；本审阅不改代码。

## Mendel binary与canonical manifest核对

旧canonical记录 `7d0b2c98`：本审阅从其声明的源commit `7a64e3b14f5c970038d1817717c35a5bb90702e7` **独立枚举canonical输入**，与manifest恰好450项一致，无缺失/多余；450个blob逐个SHA256一致，按path+NUL+length+NUL+raw bytes重算总摘要一致。归档目录内notes-clone实际SHA256也与manifest一致。这证明这份旧manifest的输入身份一致，**不改变任何旧运行失败结论**。

该manifest的dist摘要 `ac755157f95eebd047f0f2830c0877abcecb72780f5f1ec5036d77be4fa82dc6` 来自保留的旧static-debug构建；内嵌build-info身份较早已明确披露，不能写成最新Rust源的同一次前端重构建。

观察到19:33:47更新的target binary：`b85972f5ead438ad53403749d4603cfef0f5e11734c8752e62fe9526a5a2552e`，116,915,728 bytes。**不匹配现有旧canonical manifest**；之后e322 hook接线又产生新产品输入，后续若再次构建必须记录新SHA与源commit，不能把本观察hash自动当成最终hook binary。

Mendel generator工作区正在增加 `--build-record`，将保留historical baseline和新build evidence分别绑定，避免新binary被冒称unchangedFromHistoricalRecord；此次看到的是未提交diff，尚不当作冻结工具通过。新正式manifest需绑定含e322的源、实际新binary、static dist与构建日志，fresh Ready应返回nativePage finished/start/finish计数及真实interactive状态。

实际执行工具还需继续使用Dewey实际import路径，不能只哈希builderroot同名旧工具。当前runner已记录自身/相邻helper的hash；建议同时记录实际build-info.mjs、realpaths/commit及结束时hash或从冻结副本执行。产品canonical hash不等于执行工具freeze，`inputsUnchanged`当前只覆盖产品/dist/binary，报告应限定范围。

## 现有运行状态与后续独核

- 最新已读取完整双端报告 `/private/tmp/sync108-native-desktop-run04/result.json`：**failed，0 checks，NATIVE_TIMEOUT，A exit70，naturalExit=false**。
- 三端 `/private/tmp/sync108-three-20261112-03/result.json`：**fail，Ready TIMEOUT**，cleanup亦保留failure；不是完整三端通过。
- Dewey最新 `cbbaa526` 正式提交DESKTOP-RESULT精简记录，明确pending-complete-pass，保留run01–04。run02虽有29条业务断言通过，但落盘证据读取失败；不可把29条剪出来写完整通过。旧失败、原font hang、APFS早期失败均应继续保留。

后续完整双端/三端最终结果独立核对的要求已明确：新freeze的binary/product/dist/actual tools绑定；每步完整document/plainText与附件原字节SHA；真实双向/第三端传输、并发冲突与确认路径；暂停/离线/进程重启与dirty恢复；重复同步及inbox/dirty/conflict最终状态；所有owned进程退出和准确forward/reverse交接清理；旧失败和新结果分目录。手机由Singer独占，本审阅不触碰设备。

本轮没有独立重新执行浏览器、协议fixture、原生App、双/三端套件或编译。**正式完整结果仍待后续提交；当前可交付的是已完成的静态工具审阅与开放项清单。**

---

# 较早审阅与历史发现

# SYNC108 工具独立复核：更正提交增量结论

更新时间：2026-11-12 19:24（Asia/Shanghai）。**本节是当前结论，后附0897543/41f6d789首轮报告保留历史；已修复项以本节状态为准。** 主代理可将全文复制至 `docs/plan/reviews/app-sync108-tools-independent.md`。本轮只静态读取commit blobs与现有文件，未运行Node fixture/浏览器/原生双端套件，未编译，未操作手机、forward/reverse或任何设备/进程，未编辑仓库/暂存。

## 已审更正范围

- `845f21815806cde39bd3f4afdeb30e2e65d564aa`：font gate与CDP截图。
- `af360bc756cd62b130457a20301151a4ef19d5ee`：runtime.reset真实startup handoff。
- `564e85b9cafcb4f247535860ffb1ca0dd12cf65a`：Node协议/lifecycle/套件断言。
- 直接相关前置 `af1ac64a`：Rust Ready等待root解除inert/aria及startup消失，与新Node ready contract一并检查。
- 复核期间发现已提交 `cafaefe2791db985b1cfe5ccc72ef73db47d12b9`（disabled identity、canonical productFiles、实际tool hash）及 `ba5128da717d0e8c4088aa3978fbc6c08ab30410`（DB/WAL只读副本）。两者增量也已静态检查，不能把564本身说成已包含这些更正。
- 用户告知main整合5019cfbe/ab1f5f8b/cf7c8bc2/c87ba001。本轮重点仍为上述独立冻结工具commit，不重审父级源快照，不从整合状态推定执行结果。

## 当前状态

| 发现/要求 | 更正后结论 |
|---|---|
| 原P1 重启note IDs恒真 | **564e85b9已修复。** 读取实际重启workspace，建立IDs Set，再检查beforeRestart全部IDs存在；不再是 `|| true`。只证明ID保留，未扩展为每篇完整内容均已检查。 |
| 原P2 INVALID_RESPONSE迟到 | **已修复。** 先校验payload再清pending，畸形reply能及时reject；NATIVE_TIMEOUT通过#fail统一fatal。 |
| 原P2 close期间新fatal漏计 | **仍未修复，阻塞正式无误报验收。** 见下。11个Node fixture没有“合法shutdown后尾帧截断”用例，不能覆盖该反例。 |
| Android重复close删他人锁 | **原冻结版本仍开放。** 本批更正未修改Android脚本。后续Android增量请给确切commit再审，不依据工作区未提交代码宣布关闭。 |
| 原font gate长挂 | **静态修复对应诊断。** 不再await document.fonts.ready；bounded loaded-status/rAF与CDP截图不依赖被hold的document load。未把本审阅称为新跑浏览器通过。 |
| runtime.reset交接 | **静态修复合理。** 先真实reload/debug idle，再有界等待startup detached；未强制修改DOM隐藏状态或伪造ACK。 |
| fresh disabled identity | **cafaefe2已修复。** fresh stores断言disabled且无identity；显式host opt-in后捕获identity，pair后检查同workspace/不同device。 |
| canonical product source | **cafaefe2已采用productFiles/sourceIdentity。** 已核对排除Gradle build/.tauri/jniLibs/target等输出而保留手写Android源。实际工具来源另记，不能只拿builder root同名文件替代。 |
| SQL evidence | **ba5128da改动合理。** 进程退出后复制DB/WAL/SHM，副本mode=ro+query_only读取；原件逐个hash前后不变。副本SHM等可能由SQLite管理，不属于业务SQL写入或改原库。 |

## 仍需处理：P2 native关闭阶段protocol fatal漏计

精确冻结于ba5128da的 `scripts/verification/sync108-native-driver.mjs:205–238`：行206 `let cleanupFailure = this.#fatal`，随后在closed之前/回调中发生的#fail仍只写this.#fatal/lifecycle.failureCode；行234等待closed后不重新合并该fatal，237可能设置naturalExit=true。套件 `sync108-native.mjs:419–424` 只因close抛错设置cleanup failure。

反例仍为：合法shutdown response完成 → child输出以PREFIX开头但没有换行的半帧 → exit0。`decoder.end()`触发TRUNCATED_FRAME，但close局部没有错误，结果可同时failureCode=TRUNCATED_FRAME、naturalExit=true及suite passed。新增fixture中虽测试decoder.end抛错，却未把它与NativeApp.close链路连起来。

最小修复：在await closed之后 `cleanupFailure ||= this.#fatal`，并使suite拒绝任意lifecycle.failureCode；加入上述独立协议fixture反例，要求close拒绝且naturalExit=false。由作者修改；本审阅只报告。

## 新发现：P2 浏览器startup结果先写pass，cleanup失败未回写

冻结 `845f2181 scripts/check-startup.mjs:125–131,144–146`（后续af360/564/cafa/ba没有修改此文件）：desktop/mobile均先写passed:true，再进入finally runtime.cleanup。若cleanup抛错，Node虽失败，但JSON仍可能留下passed:true；desktop catch不能捕获同一try的finally异常，mobile亦无统一失败报告。这样报告消费者只看JSON会遗漏owned browser/server清理失败；不能将“有一份passed JSON”独立当作整次正式运行成功。

最小修复：测试断言与清理分别汇总，先等待owned cleanup，再写最终结果（保留断言成功但cleanup失败的两个事实）；mobile失败也写独立失败报告。若暂不改，正式消费必须同时核对进程exit0、desktop/mobile文件、清理状态，禁止只抽取passed字段。该发现没有证明作者现存运行发生清理异常，不追溯否定现有17+4声明；本轮也没有重新运行它们。

845修复的route finally先release再有界unroute，解决原gate失败路径；CDP attach/capture/detach分别5/10/2秒，有真实viewport像素，未生成替代截图。仍沿用真实startup动画/错误恢复/无应用bundle预挂载断言，未把fixture后端结果说成原生Store证明。原始hang报告与失败应继续保留。

## source freeze：实际import链与builder源须分别绑定

`cafaefe2`/ba5128da `sync108-native.mjs:187` 已用 `new URL(name,import.meta.url)` 哈希实际执行runner与相邻helper，**修复“只哈希--root下旧同名工具”的直接错误**。该改动不是仅manifest换名称。

需要保留的两个范围：

1. builder产品源：`--root`、canonical productFiles算法、产品源散列、静态dist、binary与真实build record；这是被测产品。
2. 执行工具：实际runner、相对import的Node helper，以及新引入的 `../build-info.mjs` 的realpath/commit/hash；这是生成判定的代码。当前tools只列runner/helper且只在开头取hash，结束的inputsUnchanged检查只有产品源/dist/binary，不覆盖Dewey实际工具。建议记录toolsBefore/toolsAfter并验证，或执行前把实际工具及本地import依赖复制到冻结目录，记录散列再从副本启动。若不补齐，报告应明确inputsUnchanged的范围不含执行工具，不得声称完整工具冻结已验证。

已生成独立只读核对记录 `/private/tmp/sync108-tools-source-review.json`。2026-11-12T11:23:31Z，ba5128da blobs与Dewey工作区5个相关文件hash一致，相关文件git status为空；但Dewey与builder的runner/helper确实不同：

| 文件 | 实际Dewey冻结hash | builder同名文件观察hash |
|---|---|---|
| sync108-native.mjs | ccafd649339ead595e196c0b998bb54f8f2476fc5fd26c8dfc06dacb9d7374ce | d1aa018af427828c8fcd70c8d99bf39e794266701963b53ff9e703b108cbe505 |
| sync108-native-driver.mjs | d283b8958bf6d9125f8d168e26cd3a3ae9df6d04dddd66cd6dd1b6900a9df846 | 13338173a212592c45a3cf8d1c12968c56791317aa609140b7438d800cd113a0 |
| scripts/build-info.mjs | 7e1f0b70b67e0e79375291b78def9fcc9782b540d5ab227a6e70d811afdb4362 | 当前同hash |

这些是本审阅时的文件观察与commit blobs，**不能证明早先某个Node进程实际import时的字节**，也不能为已运行旧证据补写原本不存在的工具冻结证明。后续Singer三端编排自己的入口/Android helper及相对import链也应单独记录；本轮不查看或控制手机。

## 后续复核边界

本次没有运行新增11个Node协议fixture；它们是明确披露的Node模拟子进程测试，不是原生Tauri/同步通过证明。未重跑Dewey正式17+4、sync-settings或native suite，也未将作者提交说明中的结果当成独立执行。startup产品静态结论和既有9个startup::tests独立执行报告保持不变；Mendel正式脚本P2修复另审。

当前没有从上述更正新发现P1；原恒真P1已关闭。仍开放native清理fatal、Android锁P2，新增浏览器结果/cleanup一致性P2，source freeze补全要求如上。正式双端/三端结果尚待实际证据复核，不能冒称通过。

---

# 附录：首轮冻结快照报告（历史结论）

# SYNC108 Android/native 工具独立复核（首轮静态）

日期：2026-11-12。供主代理复制至 `docs/plan/reviews/app-sync108-tools-independent.md`。本轮仅检查已提交工具快照及已有本地证据；没有编译、运行双端/三端套件、连接或操作设备，没有修改任何仓库文件或暂存区。后续实际执行结果必须单独复核，不能从本报告推定通过。

## 范围与结论

- Android：`41f6d7895c865f17d15da3afaf2b1d23f6a1290f`，对应主线 `241bed2a`，4个新增文件。两者父提交到提交的 diff SHA256 完全一致：`0d08177f785dc070c427368ed2da85b506fc961fe42f66d2f12e6e1de90991b5`。
- Native：`0897543db8b6246497fcfba0f93c9157b0903732`，`/private/tmp/cybernote-sync108-driver`，4个新增文件；对应 startup worktree 的 `5500c94a`，diff SHA256 一致：`f46c2312de3ffcc353dee3c93e77409c3566b44da6ae10dffed74220427b96eb`。
- Startup：另以 `/private/tmp/sync108-startup-independent.md` 审阅冻结 `2a34faf0`。本工具报告不混入各 worktree 后续未提交 stdio、Android background/reverse 等增量。
- **1项 P1、2项 P2 工具阻塞需修复，才可将未来运行作为完整正式验收证据。** 未发现已提交内容中业务 SQL 写入、伪造保存/同步 ACK 或明显秘密凭据。Android 已有准备证据只支持隔离包 UI 文档持久化，不支持配对、附件读回或三端同步验收。
- Native 冻结提交是待接线草稿，文档明确未编译/执行。不能把这4个工具文件存在说成已完成默认/生产排除验证，亦不能把未提交接线当成此次已提交审阅结论。

## 阻塞发现

### P1 — native 重启 note IDs 检查为恒真

`scripts/verification/sync108-native.mjs:368–377`，尤其377：

```js
check("restarted store retains existing note IDs",
  beforeRestart.notes.every((n) => (n.id === localB) || true));
```

`|| true` 使每个元素恒真；表达式不读取重启后的 workspace。即使重启后除专门核对的 localB/media note 外丢失其他笔记，也会记录该项 PASS。后续恢复同步可能从另一端补回，最终收敛不构成重启即时持久化的独立证据。

最小修复：重启并保持 paused 时读取新的 workspace，比较预期 note IDs（至少完整 inclusion，更宜排序后集合相等），并对这一步预期保留的原文档、文件夹、附件引用做明确比较；只对本用例实际修改字段制定例外，不加无条件真值。需要一个“重启后缺失另一笔记”反例证明会失败。此项为静态逻辑确证；本轮没有运行故障注入或套件。

### P2 — native close 未纳入关闭期间新发生的协议错误

`scripts/verification/sync108-native-driver.mjs:125–139,196–227`。

`#close` 行197只在开始时复制 `this.#fatal` 到局部 `cleanupFailure`。关闭期间 stdout 解码错误仍可通过 `#fail()` 设置新的 fatal/failureCode（包括 `decoder.end()` 的 TRUNCATED_FRAME），但等待 `this.closed` 后只检查退出码、信号和 forcedSignals，不重读 fatal。反例：合法 shutdown response 后紧跟不完整 prefixed 帧，再 exit0；close 可返回 `naturalExit:true`，而 lifecycle 同时有 failureCode。套件 finally 只根据 close 是否抛错决定 cleanup failure，可能最终 status=passed。

最小修复：close 完整 drain/closed 后再次合并 `this.#fatal`，naturalExit 同时要求无协议错误、无forcedSignals、无超时和code0；suite 也拒绝包含 failureCode 的 lifecycle。用上述“shutdown 成功后尾帧截断”作协议库反例，由开发者在独立路径测试；不要启动用户 App。

相关次要问题：`#frame` 行151–157在校验 payload 前清空 pending；INVALID_RESPONSE 后 #fail 无 pending 可拒绝，当前调用需等待 DRIVER_TIMEOUT 才结束。建议先完整校验再移除 pending，保留真实错误分类。这不是额外 P1。

### P2 — Android 重复 close 能移除新连接的独占锁

`scripts/verification/sync108-android.mjs:55–79`。close 没有 closed/closing guard，也没有锁所有权标识，每次都会 `rm(lockPath,{recursive:true})`。

静态反例：连接A close释放锁 → 连接B connect取得同名锁 → A被嵌套finally再次close → A删除B锁 → C可同时进入操作同一隔离设备。已关闭 API 也未统一拒绝继续调用。默认 forward 精确匹配机制不会修复这一锁失效问题。

最小修复：close 缓存唯一 promise并幂等，只由首次 close 清理；connect 分配不可预测 owner token，释放前核对当前锁仍属于自己；关闭后拒绝操作。避免自动删除不确定归属的 stale lock。需要离线锁重入反例验证 A二次close不会删除B锁。本轮没有操作真实锁或设备。

## 需由正式编排补足的断言（不追溯否定准备证据）

Android `createNote` 行195–199只核对新ID、title和每行 `plainText.includes(line)`。这不能证明段落顺序、空段、重复行数量或完整document正确，错误提示却叫 persisted complete note。文档driver.md:57已要求调用者进一步核对完整 document：因此作为创建就绪判断可以保留，但**不能单独计为正文完整性通过**。最小改动是返回后由正式编排比对完整document与plainText；或加强方法自身的精确断言、改名为保存就绪。

Android `syncNow()` 点击后直接返回 status；该返回不能证明网络收敛。正式双端/三端必须等待完整文档/附件散列与状态目标。pair() peers>0同样只是加入就绪，不能替代双向数据验收。

Native 未给 `--build-record` 时明确记录 provenance limitation，这是诚实范围，但source/dist hashes并不能证明传入binary嵌入了那些源资产。正式结果应保留构建命令、确切源/静态dist/binary绑定、freeze commit及可对应的构建日志；report.frontend.buildCommand 当前为声明字符串，不是工具实际执行或观测到的构建命令。

## scope、生产排除、真实写入与 ACK

**Native**

- `sync_e2e.rs:3` 模块内部是 `all(feature="sync-e2e", debug_assertions, desktop)`；`start:59–62` 另要求 owned child env `NOTES_SYNC_E2E=1`。没有新增invoke command或网络监听端口，实际执行在main WebView中，事件名随机UUID，带独立nonce/id与main窗口metadata检查，Rust等待有期限。超时请求退出70，不继续向可能仍在执行的JS排队，不声称取消成功。
- **0897543本身Cargo.toml只有access-boundary-proof，lib.rs没有sync_e2e引用。** 同提交NATIVE-TOOL.md:16–45要求Mendel用相同cfg接模块/调用、显式feature=[]。最终接线提交需要另审；当前模块孤立且不会进入默认构建。release/default排除仅静态条件成立，未在本轮编译验证。
- ready/execute/state/idle经现有 `window.__NOTES_DEBUG__`、真实App处理器；shutdown和EOF等待真实 `app.flush`+`waitForIdle`，没有自造quiet、保存或同步ACK。对现有业务处理器正确性不扩展为此次工具提交的测试结论。
- runner以fresh external output复制同一binary，为两个进程提供独立新data roots；SQL证据仅在owned app退出后 `mode=ro&immutable=1` 连接，拒绝非空WAL、检查读前后DB散列和integrity；没有UPDATE/INSERT/DELETE或借SQL造同步状态。
- 附件使用公开披露的合成File[]进入现有attachment.submit处理器及真实保存管线；没有OS picker实测声明。读取附件使用真实App access snapshot，不伪造session或epoch。
- static debug必须显式DEV/VITE_NOTES_DEBUG/NODE_ENV变体，使用tauri静态origin；这与普通production frontend不同，不能记作生产配置完全相同的验收。

**Android**

- 所有adb命令固定 `-s 98895a3147304c3132`，包只为 `com.local.notesclone.sync108`。PID必须唯一且/proc/cmdline匹配；CDP仅接该PID的唯一tauri.localhost页面并校验loopback websocket authority。
- Gradle init脚本仅显式opt-in，在debug applicationIdSuffix追加.sync108、覆盖debug label；不改release ID/namespace。build强制worktree本地Cargo target，Gradle home独立；正常Gradle缓存/wrapper符号链接是已披露共用缓存，不能称完全无共享缓存。
- 操作通过CDP Input和可见产品控件；只读IPC load_workspace/status/read_attachment；未见业务写IPC或SQL写入，也没有注入editor.commands绕过真实输入保存。原失败Enter操作已修为text/unmodifiedText CR，并保留先前失败。
- frozen driver没有install/clear/uninstall入口，launch/restart只操作隔离包；安装是准备期人工授权行为，不从此静态审阅推定已重新核对设备状态。

## 秘密与证据

- 对两提交共8个文件（83,639字节）做常见private-key/provider-token/高熵secret赋值模式扫描，未见候选；startup7文件也未见候选。这是定向扫描加关键数据流检查，不是穷尽秘密检出保证。
- 邀请在stdin/内存中流转，无argv邀请设计；native不记录请求参数/响应/原stdout噪声，只记stderr字节数，异常降级为枚举代码；snapshot拒绝敏感邀请DOM，Android截图拒绝非空data-sensitive字段。协调者仍不得把返回的原始workspace或数据库当成可公开证据；身份UUID、测试序列号不是授权凭据，但只应在内部范围保留。
- Android提交仅小型driver.md/verification.json加工具源码，没有APK、target、缓存、数据库、截图二进制、邀请或设备私密文件。APK约343.7MB只在本地artifact路径被引用，应继续留在git之外。Native工具提交亦没有二进制/target。整合时应检查根与嵌套Cargo target、本地gradle-home、APK、日志、临时原始证据均不进产品提交；这些路径结论仅覆盖工具提交，不替代全工作区审计。
- 已读已有Android本地smoke-before/after：完整note相等、附件列表相等，metadata变化（重启session变化预期）；证据文件sha分别 `dc8a6036eb85e0d05545f17a4c32d0d702b12459a1f541378de9e6dfe244fa86` 和 `a3fa215b90a9368b7d1008d6b9e53fd00dcafbcef516c41c1734e93c6eaf507a`。这是已有文件交叉核对，没有重新操作Android。
- 本地smoke-result.json只有4个checks；提交verification.json另有第5项设备名Input/空邀请UI检查，未见同一个原始smoke-result中对应的独立新增记录。不能把汇总字段当作本审阅重新观测；若用于正式准备验收，补上对应步骤原始结果或注明人工观察。
- verification.json明确pairingExecuted=false、invitationGenerated=false、attachmentReadExecuted=false、desktopOrThreeDeviceSyncExecuted=false。**准备期pass不等于配对、附件或同步pass。** 原失败smoke-attempt01摘要仍在本地，未被新pass掩盖。

## owned资源清理审阅

- Native仅通过自己spawn的ChildProcess对象kill，没有pkill、按进程名/端口清理；关闭有15s等待、SIGTERM3s、SIGKILL3s、pipe close3s，并把forcedSignals视作失败。上述P2修复前仍有协议错误漏计；不因机制存在就宣称实测全部自然退出。
- Native close本身幂等；输出和测试数据留作证据，不自动删用户路径。stdout/stderr流close等待有界，绝不把强杀当验收自然退出。
- Android forward使用 `--no-rebind tcp:0`，清理核对serial/local/remote三元组后精确remove，不批量remove-all，冻结工具没有reverse创建。上文锁P2仍需修。
- Android文档明确崩溃stale lock须人工确认，不会抢锁。准备报告保留一个attach forward `tcp:59445 -> localabstract:webview_devtools_remote_23814`，retainedForHandoff=true；本轮不查询或清理它。它是交接保留资源，不能记录为“所有资源已清零”。正式执行最终应核对其准确归属、交接后旧PID映射及本轮新映射的处理结果。

## 建议整合/后续门禁

1. startup产品实现与工具提交分组，保留各自来源，勿合入父级巨大源码快照。
2. 由Mendel/主代理指定开发者修正上列P1/P2，并提交冻结接线与修复版本，独立复核新diff。此次报告只对所列冻结commit成立。
3. 先跑工具自身的离线反例（缺失note、shutdown尾帧截断、double-close锁重入），后执行fresh output的原生smoke/完整双端/三端；禁止覆盖现有失败或准备证据。
4. 后续独核实际每步检查、退出/强杀、owned forward/reverse清理、全document/附件sha、dirty/inbox/conflicts及真实source/binary绑定，保留任何失败。未给出结果前，正式验收状态仍为未完成。
