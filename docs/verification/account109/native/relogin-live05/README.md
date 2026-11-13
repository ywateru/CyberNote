# 原双桌面资料库重新登录 live05：授权等待超时

2026-11-13 UTC 13:30:19.908—13:42:28.882，FAIL：`CONDITION_TIMEOUT / b-recovery`。保留原双桌面数据根，使用已核 `72513d12` Mac binary及隔离.app，父级记录执行HEAD78fa814e（原始result不直接记录HEAD，9e989b61仅为随后新增集成文档），新pin已独审、完整集成274/274通过。仅开启 `--allow-b-signed-out-relogin`，人工授权预算600000ms，目标end-state enabled未达成。

原库基线PASS：原文件保持、完整分支/附件及重叠一致性在启动前核对。两GUI ready，A/B clean signedOut；B完整120秒只读启动观察后，通过现有产品UI handler发起一次系统浏览器SignIn。原生Chrome实际观察到固定Logto origin的登录表单，截图只留主机私有目录。agent未输入凭据，原内存QA密码无可恢复来源，人工认证未完成。B保持authorizing，10分钟终态等待超时；没有发起第二次授权，没有编辑、enable或后续同步场景。

A PID41958、B PID41967均自然退出0，无signals/forcedSignals，父级另行确认PID不存在。原数据、私有before基线和步骤/原始结果保留；不清理失败目录。既有scope错误未在此次进入token验证，因此本轮既不证明修复，也不构成再次复现。

[结果](result.json)只正规化本地binary path及两store directory，原始及归档SHA、父级浏览器观察和进程检查见 [receipt](receipt.json)。不复制baseline全文、DB/grant、浏览器AX/地址或凭据。原库owner/profile/history及全文/附件门槛不变；下一次成功验收需要原专用测试账户的有效登录授权。未创建或重置任何账户。
