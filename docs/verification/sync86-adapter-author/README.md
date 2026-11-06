# SYNC86 Rust adapter 作者验证

最终产品/transport源码冻结为 `fb6a265f4274334352c5a584a918da80f23f70ee`，前置产品实现 `10cd8326`、本机stdin接口 `fd640fe2`；本目录是随后追加的纯证据。作者工作树 `/private/tmp/apple-notes-sync86-adapter`，分支 `codex/sync86-adapter`。主线源码未修改；仅经根授权复用主线 Rust target。最终生产check结束后已释放该target，未自行merge/push。独立verify及根整合仍待后续执行。

## 冻结源码最终结果

| 验证 | 结果 | 命令墙钟 |
| --- | --- | --- |
| 84完整独审runner，包含全部生产Store/Session/sync测试及原独审cases | 自然0；144 passed、0 failed、3 ignored | 10.063秒 |
| 85完整runner，未用filter | 自然0；9 lib + 1 concurrent downloads + 3 independent + 6 network + 1 process，共20 passed | 25.571秒 |
| 完整生产Tauri cargo check | 自然0，原有/当前dead code等warning保留 | 2.374秒 |
| 冻结源真实transport构建08 | 自然0，逐文件源指纹前后一致 | 5.343秒 |
| 原生产local recording registry + 实际Session窗口ACK wrappers | 自然0；14 checks，单owned Rust进程自然0 | 0.442秒 |
| 真实独立SQLite/Noise/WebSocket扩展进程套 | 自然0；49 checks、163 events；9进程自然0、1进程按用例故意SIGKILL | 49.474秒 |

84三个ignored是现有由边界测试另起子进程调用的crash worker入口：archive、attachment operations、recordedAt；没有新增忽略或过滤。测试自身Rust耗时分别见原日志（84 6.30秒，85分组0.22/2.59/2.56/5.73/6.92秒），表中墙钟含编译/调度。最终命令的时间/exit独立记录于 `sync86-final-rust-recheck/*.json`；三命令使用不同target并行，未并发写同一target。

所有命令工作目录都是 `/private/tmp/apple-notes-sync86-adapter`：

```sh
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync84-target CARGO_BUILD_JOBS=2 cargo test --offline --locked --manifest-path docs/verification/sync84-core-independent-01/runner/Cargo.toml
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync85-target CARGO_BUILD_JOBS=2 cargo test --offline --locked --manifest-path scripts/sync-network-test/Cargo.toml
CARGO_TARGET_DIR=/Users/water/work/2026/Apple-Notes-Clone/src-tauri/target CARGO_BUILD_JOBS=2 cargo check --offline --locked --manifest-path src-tauri/Cargo.toml
CARGO_TARGET_DIR=/private/tmp/apple-notes-sync85-target node scripts/debug/build-rust-attachments.mjs /private/tmp/sync86-transport-build08
node scripts/debug/rust/check-sync-transport.mjs /private/tmp/sync86-transport-build08/notes-current-attachment-transport /private/tmp/sync86-transport-wrappers-final
node scripts/debug/rust/check-sync.mjs /private/tmp/sync86-transport-build08/notes-current-attachment-transport /private/tmp/sync86-process-final
```

builder实际运行 `cargo build --locked --offline --manifest-path /private/tmp/sync86-transport-build08/harness/Cargo.toml`，复制冻结的真实Store、Session、sync全模块并编译。AppHandle/OS包装由stdin提供；local recording纯registry从生产 `recording_window.rs`按唯一边界原样提取，源码边界不符即失败，没有另一份算法。最终不可变二进制副本：

```text
/private/tmp/sync86-transport-build08/notes-current-attachment-transport
SHA256 898331177b9f3f40fcc197c84acd1d93622bc3d453da078cf0c1429ebc81acc3
```

builder原target路径是 `/private/tmp/apple-notes-sync85-target/debug/notes-current-attachment-transport`；上述副本在最终实验前复制，实验status记录它的相同SHA。`sync86-transport-build08/build.json`记录完整逐文件指纹、sourceHead、sourcesUnchanged=true、命令/自然exit/二进制SHA。最终进程套独立计算整个 `src-tauri/src`、`scripts/debug/rust`、builder和生产Cargo的完整源指纹，前后都是 `1735bf7ab078ca7bf35303eabf7d55187f31af4ad3fe8039f7428d72f21ee8c9`。

## 验证覆盖和实际进程

最终真实套使用各自临时根目录的SQLite，真实生产Noise/WebSocket，不使用内存network fake。验证默认status无identity生成/optional省略、认证后adopt、A创建/B编辑/A收敛、普通与智能folder、多帧160KiB附件与原字节、保护owner保持durable pending且无关note继续apply、release后apply、lock与撤权/原密码解密、delete/restore、持久stop/冷启动paused、同entity离线并发keep-all、100次重复wake不增revision、三设备heads/blob转发、protected inbox真实SIGKILL恢复、purge对在线及旧离线设备不复活、plain图像/音频并发、locked文本并发、Prepared认证后adopt失败再冷启恢复、错Noise key与跨workspace拒绝、真实quiet probe/prepare/release。

录音local wrapper验证原owner/incarnation、登记丢响应精确重试、重复start拒绝、伪incarnation拒绝、跳revision拒绝、checkpoint不能提前release、final ACK后幂等release、已释放身份不能重用。access wrapper验证异步workspace_action等待实际`acknowledge_access`，negative ACK真实abort，positive ACK真实commit并发metadata。最终扩展进程脚本的lock/delete/purge均使用这一真实workspace_action事件/ACK通路，未再使用debug_access手工finish。

最终进程套实际PID及终态：A 5370、B 5371、B-restart 5405、C-forward 5409、A-SIGKILL-restart 5412、Bad-auth 5446、Prepared-adoption 5447、Prepared-recovered 5448、Other-workspace 5458均自然code0/signal null；A-restart 5404由用例明确SIGKILL，code null/signal SIGKILL，不能称自然退出。单wrapper进程5374自然0。原始生命周期与checks在各 `status.json`，最终事件在 `sync86-process-final/events.json`。

完整Rust回归还覆盖strict command/reply/token unknown字段、伪window/session、ready后取消线性化、窗口集合变化、save intents/access barrier/超时/stale plan、metadata不误增epoch、locked普通远端metadata保留unlocked key、blob字段/摘要/归属/seen equivocation/预算先验证、受控路径/任意路径/symlink拒绝、已损坏cache拒绝、重复发布与同inode直接rename、网络3文件/256MiB及本地capture1文件/256MiB。网络3+本地1的全局4文件/512MiB采用主线正式规格提交`0f95545a`，未在本分支改另一份架构规则。

## 原始失败与修正

所有失败原件保留，未覆盖为pass，也未把早期通过追认给后续源码：

- `exploratory/sync86-adapter-tests-first.log`：初版5项3pass/2fail。一项发现serde tagged unit variant会忽略额外字段，改成空struct variants后strict反例通过；另一项测试误以为84要求plainText等于doc，改为契约真正禁止的未知note路径字段，未扩大wire规范。后续log保留recheck。
- `sync86-process-expanded-first/`：真实扩展38.974秒，前半含三设备、SIGKILL恢复、purge通过，失败是测试尝试给locked note添加音频，被现有业务正确拒绝；改为plain媒体并发和locked文本并发。既有业务及wire均不支持locked+media，本任务没有扩schema或放松引用校验。
- `sync86-process-expanded-recheck/`：42.831秒，失败是测试驱动最新workspace snapshot被排队旧access事件回退，随后严格Token检查拒绝。修驱动同session单调epoch与sync命令前刷新snapshot，生产授权检查保持。`sync86-process-expanded-token-recheck/`49.273秒/49项通过，仍属于10cd8326前后首次冻结阶段。
- `sync86-final-rust/`：冻结10cd8326完整84为142pass/2fail/3ignored；85 lib为8pass/1fail，失败使后续集成组未运行。一项旧network fixture按4个网络文件构造，与正式3文件预算不符；另一项独审发现坏blob输入创建空publication lock文件。fb6a265f按3文件更新fixture，锁文件在显式启用/已启用恢复时初始化，失败blob保持文件快照。Tauri此轮自然0。该初轮三JSON的wallMs使用串行收集时刻，属于命令完成时间上界，不能当作独立精确命令耗时；最终recheck已按各子命令独立计时。
- 最早 `sync86-process-first/`25.008秒通过；当时进程套指纹只取git diff，遗漏untracked，不能声称它是完整源指纹。保留各build源映射与03/06/07记录作为历史，最终复现只以fb6a265f/build08/final为准。

`exploratory/`还保留早期lean/完整84、preflight、publish与quiet专项日志。它们说明开发过程，不能替代最终完整suite。`artifacts.sha256.json`列出归档原始artifact的SHA（不含本README及清单自身）。

## 交付边界

没有读取用户真实库、调用真实麦克风、触碰原Android AVD/未保存录音、操作隧道或Apple Notes删除；测试音频是合成WAV。未把临时SQLite、identity私钥、PSK或邀请token拷入git，仅归档日志、合成metadata/events及build源指纹。

此目录证明生产Rust adapter、真实网络/Store与明确stdin包装行为；它不证明真实双App PM composition/DOM/Undo/录音ticket/picker生命周期，也不证明OS窗口退出、Android新包/实际运行或87路由。这些由不同作者及整合门禁继续完成。Androidbackup XML在本作者范围仅静态配置，未冒称已编译APK或设备运行。整体用户同步目标尚未完成。
