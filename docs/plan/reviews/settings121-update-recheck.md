# settings121-update U1–U5 / D5 修复独立复审

2026-11-19。**模块复审结论：PASS，U1–U5 原 blocking 均关闭，D5 native 接点通过；1 项 P3 nonblocking 文档残留。**

准确被测实现 HEAD：`5f060a01f9c49a13cb39e647e1b16780f911c2dc`。
用户已明确确认此最终freeze；开始/结束验证均核对HEAD一致、工作树干净。
工作目录 `/Users/water/work/2026/.cybernote-worktrees/settings121-update`。
本次只提交review，不改实现，不读/测试integration pending文件。
原审查实现 `cfde38103f71d0dd1fdf3e60a5c720a63abb2461`，报告见
[settings121-update](settings121-update.md)。本次重新读取agent.md、双README、fix全部源码diff及新增fixture。

此PASS仅是已测模块边界，**不是组合App、真实退出/ready屏障、完整发行包或双端安装验收**。
release-identity独立任务的RID3实际仓库ENOBUFS问题未由本update提交修复，也未在此改判通过。

## 各阻塞项复验

| ID | 原等级 | 本次 | 关键代码位置（5f060a01）与证据 |
| --- | --- | --- | --- |
| U1 | P1 blocking | **关闭** | `archive.rs` 的entries/stream/snapshot/extract；`install.rs:321`。actual inflate/size/CRC/终止/预算校验取代ditto，无第二个未经验证的提取源。原始负例已拒绝，实际系统ZIP兼容性补测通过。 |
| U2 | P1 blocking | **关闭（恢复策略改为安全保留）** | `replace.sh:33–44`、`install.rs` report/acknowledge。launch尝试后失败或无ACK进入recovery_required，保留候选/backup/pending，不移动活候选、不重开旧宿主；迟到ACK不转成功。 |
| U3 | P2 blocking | **关闭** | `service.rs:135–215,450`。admission检查存活HeldInstall，pending SHA绑定事务，显示phase不再是授权；匹配终态才take lease，在锁外drop且只一次。 |
| U4 | P2 blocking | **关闭** | `useSoftwareUpdate.tsx:104,129,188`、Settings error/retry。失败action持有原patch副本，重试不使用旧native retry替代；action错误优先。 |
| U5 | P2 blocking | **关闭** | Settings.Toggle及software-update.css的toggle。真实input与关联label为44×44，track仍30×18；边缘点击/禁用/键盘通过。 |

### U1 — 实际解压界限和完整性

核对解析器：ZIP32中央/本地name、flags、method、CRC、compressed/uncompressed metadata，
local extra及central extra的0x0001、sentinel、descriptor、路径/种类、重复/重叠/count均有拒绝。
`stream`用固定输入/输出缓冲逐步DEFLATE，每步检查deadline（包括零输出块），按实际产出累计
单项及全局2GiB预算，在越界chunk写盘前失败；要求压缩流终止、消耗完整压缩长度、精确size与CRC。
STORE也按实际输出校验。不是仅靠声明字段或事后walk。

安装将下载源复制到private unlinked snapshot并核对发布SHA，同一FD先验证再提取，防止路径替换
影响提取输入；openat保留目录FD、no-follow/exclusive创建，不恢复链接/AppleDouble metadata。
解包后仍校验identifier/core/exact executable/arm64/native hash和codesign。普通小文件及可执行模式保留。

实际检查：

- 作者archive_tests：8MiB压缩流、仅central虚报、两套头一致虚报、CRC损坏、截断流、小预算写盘前拒绝、
  descriptor、local/central ZIP64 extra、snapshot源替换、预存父symlink，均通过。
- 原审查留下的`understated.zip`和`zip64-extra.zip`直接喂给当前真实validator，分别为
  `Err("archive_local_mismatch")`、`Err("zip64_archive")`。
- 独立两套头都宣称1byte、实际8MiB的包为`Err("archive_limit")`，确认实际流校验路径。
- 独立创建临时arm64 tiny .app并ad-hoc签名，通过系统`ditto -c -k --sequesterRsrc --keepParent`
  生成ZIP（2,723 bytes），当前extract_verified成功；提取native原bytes一致，
  `codesign --verify --deep --strict`成功。只在temp目录，未操作用户bundle。

上述小包证明系统产物基本兼容及负例，不推断完整真实Tauri bundle资源闭包或所有文件系统。
未创建/解压超过2GiB的大包；总量逻辑用可控小预算测试与源码检查证明。

### U2 — live进程、无ACK与迟到ACK

原helper负例仍复现：新replacement活着、无ACK时恢复旧target并重开old。
修复helper在no_ack、open_error_live、late_ack三种情况均：exit1、phase=recovery_required、
`oldReopened=false`、target仍new、backupRetained=true、新测试进程仍活；success ACK为complete/exit0。
所有自建进程terminate+wait，不依赖系统遗留进程。

独立运行当前**实际acknowledge函数**于临时.app可执行宿主：
awaiting_ack+matching native hash写host_initialized且保留pending；recovery_required无ACK及已有迟到ACK
均返回pending_install_requires_recovery、pending保留、不改ACK；complete才转存receipt。
所以不是只检查shell最终文字。服务recovery报告明确未自动回滚/再次启动，保留备份、要求先安全退出人工恢复，
不把包被移回等同运行态恢复成功。策略符合本轮用户允许的“未知新进程状态保留pending、不自动回滚”边界。

stage move失败、尚未尝试opener时仍可回滚并重开old，更新后的replace-proof覆盖；
一旦尝试launch，opener失败不再作为“新进程已退出”的依据。

### U3 — 原生事务所有权

新旧相同行为断言证明旧configure在waiting_exit误接受、修复拒绝update_busy。
29项模块测试另覆盖configure/check/download/install四个原生命令、强制display phase=idle、
8个并发status reader、cancelled后错误写回权威state、lease drop计数仅1及取消后新操作可接受。
损坏/更换pending、recovery_required保留lease，未知状态不会被当成可释放的安全终态。
源码确认lease析构在inner/lease mutex释放后，未将宿主coordinator析构置于模块锁内。

### U4/U5 — 实际React旧/新同负例

加载冻结cfde3810旧React代码重现configure失败→check、原开关30×18无label。
固定5f060a01代码下，native旧retry分别为null/download/install时，三种序列均为：
`configure:{"automaticChecks":false}` → 同一个configure patch，最终automaticChecks=false。
不会错调check/download/install清除未保存意图。
三个switch均测得44×44、labels=1；(1,1)边缘点击、Space键、下载期间disabled边缘点击均符合预期。
浏览器fixture零page/console/request错误。复用旧共享CSS并实际加mobile wrapper；最终整合cascade仍另验。

## D5 native接点

`version.rs:2`唯一current_version从非空option_env(CYBERNOTE_RELEASE_VERSION)取full identity，
缺失/空回退Cargo core。`SoftwareUpdater::new`及`install::mac::stage`已调用同一helper/validate_install_version；
不是仅改DTO。新版本选择/下载校验仍使用该native status.currentVersion，mac live plist按core比较。

实际3种编译fixture：unset、empty、preview.1；旧/未知core拒绝同core preview.2，已知preview.1接受preview.2，
相同preview.1拒绝，live core不匹配拒绝。既有真实Version比较器的stable/pre排序回归仍通过。
`feed.rs:164–189`的receipt顶层/嵌套releaseVersion字段存在就严格验证与候选full tag相同（可选v前缀），
null/错误类型/空/错preview/错stable/两处冲突均拒绝；两处都缺失仍走旧receipt core路径。
包内manifest/plist及receipt.buildInfo.version继续用core，无错误要求preview字符串成为short version。

此处只证明native消费接点。可信编译env由独立build.rs/发行身份任务供应，不能接受前端传当前版本。
实际组合仍须证明同次frontend metadata→build.rs env→native currentVersion及stage/receipt完整链，
包括releaseIdentityNotice真实渲染和旧包保守提示；本次不读取未冻结integration来冒充已接通。

## 完成的命令与产物

| 检查 | 结果 / 范围 |
| --- | --- |
| native-blocking-proof.py | baseline三个原行为回归0pass/3fail（预期），current3/3pass；临时源码镜像追加private-boundary probe。 |
| verify.py --commands --identity-fixtures | **29 native/module tests PASS + 3 compiled identity fixtures PASS**；实际commands/generate_handler编译，临时ad-hoc validator；非完整Tauri。 |
| helper-blocking-proof.py | 原活进程问题重现，修复4种live child场景PASS，均清理child。 |
| replace-proof.py | **10 cases PASS**，包含新recovery语义及未launch的rollback/exit veto。 |
| ui-blocking-proof.mjs | 原两问题重现；3种stale retry修复及44px触达/禁用/键盘PASS；实际React+controlled native client。 |
| 独立archive probe | 系统ditto临时signed bundle验证/提取/codesign成功；3个原始/强化坏ZIP均拒绝。 |
| 独立actual acknowledge probe | 4 cases PASS：正常等待、recovery无ACK、recovery迟ACK、complete。 |
| pnpm typecheck / version:check / git diff --check | PASS。 |

证据仅本地隔离目录：

- `/tmp/settings121-update-recheck-old-new.log`、`settings121-update-recheck-native.log`。
- `/tmp/settings121-update-recheck-helper-live.json`、`settings121-update-recheck-helper.json`。
- `/tmp/settings121-update-recheck-ui.log`、`/tmp/settings121-update-recheck-ui/results.json`及截图。
- `/tmp/settings121-update-recheck-archive.py`、`settings121-update-recheck-archive.json`、archive-build.log。
- `/tmp/settings121-update-recheck-ack.py`、`settings121-update-recheck-ack.json`、ack-build.log。

没有重跑无关全套、没有真实GitHub大包下载/服务凭据/用户库/安装包替换。
没有运行真实退出/保存/录音/ready屏障、WebKit、Android WebView或真机；这些不计PASS。
Android仍为unsigned下载-only，无安装按钮/安装绕过，当前补丁未改变其能力边界。
最终唯一updater、双handler、scheduler所有权/清理与真实退出lease由host整合验收，不在此判完成。

## 非阻塞文档项

**U6 — P3 nonblocking**：`src-tauri/src/software_update/README.md:87` 仍有旧句
“A replacement that never reaches this boundary is rolled back after 90 seconds”，
与同段后文及当前helper安全保留策略矛盾。后文policy、capability用户文案与运行结果均已正确，
所以不重开U2 blocking；建议删除/改成90秒后进入recovery_required、保留候选/backup/pending。
整合 owning settings121 安装失败描述也应据最终策略同步，避免继续承诺不可证明安全的自动回滚。

本次U1–U5/D5接点复审可交整合；保留上述平台/真实包/宿主门槛及identity RID3，
不将模块PASS外推为整体发布完成。本提交仅此文档。
