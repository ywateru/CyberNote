# fe10c3a 独立有限检查

日期2026-11-03。**有限后端检查通过，但候选存在独立静态P1，整体FIX03未验收。** 静态发现见 `docs/plan/reviews/app-001-fix-03-static-01.md`：pending旧基线正文可能被外部hydrate推进revision，后续队列静默覆盖他窗。开发正在修订，本目录结果不外推至后续候选。

## 身份与已执行

- `source-identity.json`：检查前18个候选文件逐字节等于fe10c3a；其他工具栏插件修改排除。没有构建或运行主GUI。
- `rust-command.json`、`rust-tests.txt`：独立执行真实默认feature `cargo test --locked --offline --lib`，25pass、1既有subprocess helper ignored；其中公开流程测试仍实际调子进程worker。不是GUI线程或Tauri命令调度证据。
- `frontend-commands.json`、`schema.txt`、`access.txt`、`editor.txt`：65文档schema、12生产gate有限例、真实编辑器schema/state/history表格转换与selection/Undo通过。测试stdout在本目录独立捕获；未将后续开发可能更新的共享artifacts冒充本轮输出。
- `independent-backend.json`、`independent-backend.txt`、`independent-backend-command.json`：六项另写有限probe通过。直接path引入真实Session/Store/archive/schema/crypto，独立合成根，不替换生产行为；没有改共享生产源码。
- `backend-export-unlocked.notesbackup`：合法keys仍在Store中时真实export，所有四个锁定文档仅sealed+允许标题，原文与PRIVATE标记均不在归档正文中。
- `backend-post-release-identity.json`：编译运行期间开发明确保持Rust不变，probe完成后已通知开发可改Rust；采集末次快照时Store已开始新恢复分支修改，因此不声称末次共享树仍全匹配。初始18文件身份及此前空diff已独立核对；现存probe二进制hash和直接依赖版本同时记录，未在改后共享源上重跑旧候选。

## 六项独立backend probe

1. 同Store先正确解锁合法rich，再以正确密码解锁非法树；archive_invalid、raw row完全不变、workspace不变、合法授权仍可读。
2. 同样验证非法drawing属性spray，避免把只校验树结构当完整校验。
3. 对另一合法drawing用错误密码，现有workspace与授权不变。
4. 合法rich/drawing均已解锁时导出，归档所有文档仍只有密文正文，无PRIVATE标记。
5. 真实Session closeLocks后，旧token和当前token的sensitive均拒绝、note_text拒绝、保存授权注册拒绝；removeLock经真实Session barrier后Store拒绝且abort；workspace无PRIVATE。
6. 冷Store没有keys，正确密码再解锁合法rich/drawing，与冻结预期document逐值完全相等。

probe源码/锁文件在相邻 `../probe/`。复现时先核冻结Rust输入；用 `cargo run --locked --offline --manifest-path docs/verification/qa-fix-03/probe/Cargo.toml --target-dir src-tauri/target -- <绝对输出目录>`。它只读冻结夹具、创建独立临时Store及输出文件，不跑fixture生成器、不改主App数据。真实backend状态机probe特意使用空参与窗口集合，**不证明两窗、ACK调度或真实IPC敏感命令拒绝**。

## 仍未执行

独立真Mac窗口Q1/Q7/Q8、Q2/Q3/Q4可观察请求时序、真实Tauri invoke、搜索/分享接收链，以及安装产物身份都not-run；开发自测不当成独立通过。本轮未安装旧Android候选，避免已知P1修订前重复整轮。源/产物冻结与明确GUI交接后继续有限验收，当前主机界面仍归开发。
