# Login surfaces integrated source checks

2026-11-13，Asia/Shanghai。父级在干净 main `62d6611f0eb280fbfb2daf1768c79ab47a1ff2bf` 执行：

```sh
node --test scripts/verification/account109-*.test.mjs scripts/verification/sync108-native-driver.test.mjs scripts/publish/*.test.mjs plugins/tauri-plugin-notes-auth/policy.test.mjs
```

结果 **260 passed、0 failed、0 skipped、0 cancelled**，245 个顶层项，4,942.39625 ms，exit 0。TAP 保留在私有 `/private/tmp/account109-login-surfaces-integration01.tap`。同一精确 commit 的 manifest dry-run 为 `changes=[]`。

集成源码对应：UI `001a5b40`，native `4e613313`，manifest policy/pins `49414bbf + af926c52`，runner `2dca732a → 4ae799d5`。独立 UI、Runtime、平台和发布清单审阅均已归档。作者在精确 native 源码执行账户测试 37/37，实际编译 Rust/macOS Objective-C；父级本次没有重复该 native 组。Node 结果包含规则编码、真实 React/受控时钟及 stdio fixtures，不是 WebView、浏览器表单或 Android 验收。

下一步为同一最终源码的 Android/桌面候选构建。新执行器暂保留旧 `9e7c46d2` source/binary pin，**不得据此启动双入口实际测试**；新候选身份核验后须另行更新精确 pin。旧 live02 实测属于新增需求前的版本，仍保留其限定通过范围。
