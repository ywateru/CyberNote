# U1–U5 修复与 D5 native 小接点回执

日期：2026-11-19。修改树 settings121-update；基线 HEAD f8662f41（审查文档），被审实现 cfde3810。未修改审查报告、build.rs、公共 lib/App、主树或其他工作树。最终交付 SHA 见提交消息；inputs JSON 记录本次实际源码摘要。

- U1：真实增量 DEFLATE/STORE 输出计量、每项 actual size/CRC/压缩流终止校验、两套头与 descriptor/ZIP64 extra 校验；失败在越界字节写盘前。安装仅从私有 unlinked、同一 FD、发布 SHA 核验的快照提取，openat/no-follow/exclusive 写出，删除 ditto 路径。原始 central 虚报与两套头一起虚报、损坏 CRC、截断流、预算、源路径替换、父链接均有回归。
- U2：launch 尝试后的 opener 错误/无 ACK/迟到 ACK 均进入 recovery_required，不移动运行中的候选、不重启旧宿主；保留候选/backup/pending/report。只在尚未尝试启动的 stage rename 失败时安全恢复旧包。原生报告和 UI capability 文案明确“未自动回滚或再次启动，需先安全退出再人工恢复”。没有新增猜测 PID 或强杀系统。
- U3：原生 admission 依据存活的、pending SHA 绑定的 InstallLease；不依赖 status.phase。匹配 cancelled/unchanged/rolled_back/complete 才释放；未知/损坏/更换事务、recovery_required/rollback_failed 保留。helper 终态写回权威状态，lease 在模块锁外只 drop 一次；多 status reader 与所有 native mutation 均有回归。
- U4：Provider 保留失败 action 和原配置 patch，retry 不借用旧 download/install status.retry；不以 check 成功代替配置保存。外部文件 CAS 可持续拒绝，文案明确需重新打开后重试，不覆盖外部改动。
- U5：实际 switch input 和 label 均44×44，visual track仍30×18；手机边缘点击、label关联、禁用与键盘真实浏览器检查通过。
- D5：唯一 current_version helper 使用非空 option_env CYBERNOTE_RELEASE_VERSION，否则 Cargo；new 和 mac staging 通过此 helper，core plist检查保留。Receipt 顶层与buildInfo可选releaseVersion只要存在就核验完整候选tag；旧receipt缺字段仍按core。三种编译环境fixture验证preview与保守旧包路径。

定向验证：

1. `python3 scripts/verification/settings121-update/verify.py --commands --identity-fixtures`：29 native/module tests通过，另3个实际编译环境identity fixture通过；实际Tauri commands/generate_handler编译；包含临时ad-hoc native validator，未进行实际bundle安装。
2. `native-blocking-proof.py`：冻结cfde3810的同3条行为断言全部失败（U1两条、U3一条），当前全部通过。temp源镜像只为了访问private边界，算法来自相应真实源码。
3. `replace-proof.py`：10种临时fake bundle场景通过，更新了启动后失败的预期为recovery_required。
4. `helper-blocking-proof.py`：旧实现活replacement仍重开旧宿主的负例复现；修复4例（无ACK、opener错误但子进程活、迟到ACK、成功ACK）通过；所有自建child terminate+wait。
5. `ui-blocking-proof.mjs`：旧React两问题复现；修复3种stale retry输入通过，真实44px边缘/键盘/disabled检查；受控native client。
6. 作者 `browser-proof.mjs` 原有Chrome fixture及截图通过；typecheck、version:check、root Cargo metadata --offline --locked、git diff --check通过。

详细输出在本目录 blocking-fix-evidence；浏览器完整截图保留于 /tmp/settings121-update-fix-ui 和 /tmp/settings121-update-fix-author-ui。没有访问真实账户/笔记库/服务，没有运行完整native App build、真实退出安装、WebKit/Android设备验收。这些不计PASS，最终生产lease/readiness接线由集成负责。此回执供Confucius复审新fix，不自行覆盖独立审查结论。

归档纠正：最后一轮初次使用完整 cargo metadata 预处理临时harness锁，因离线缺无关平台proc-macro-crate而中止；已改为当前宿主 cargo test --offline --no-run 适配临时锁，再 cargo test --offline --locked 正式执行，29项及3个编译identity fixture全部通过。最终native.txt为成功重跑输出，不把前置失败计为产品回归通过。
