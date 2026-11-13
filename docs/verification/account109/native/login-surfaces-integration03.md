# 双入口实际关窗及新版relogin pin后的父级集成

干净main `78fa814e` 上执行完整既有组，274/274 PASS、259 top-level、zero fail/cancel/skip/todo，4874.286ms、自然exit0。

```sh
node --test scripts/verification/account109-*.test.mjs \
  scripts/verification/sync108-native-driver.test.mjs \
  scripts/publish/*.test.mjs \
  plugins/tauri-plugin-notes-auth/policy.test.mjs
```

原始TAP仅保留主机 `/private/tmp/account109-surface-window05-integration01.tap`；SHA256 `2685e2e9ca5738c8dbceb5dc9bece43aca006f1eacb372329de9f16a0a47e1d6`。

本轮唯一新执行器改动是relogin候选从920fa9cf精确更新为已核72513d12，控制流/owner/history/fullbody/attachment停止门槛不变，作者及独立定向组58/58通过，见 [独审](relogin-pin72513d12-review01.md)。真实 [window05](login-window-live05/README.md)、手机匿名health和新APK包身份各有自己的记录，本集成组不能替代成功认证、Android产品请求或真实账户三端。
