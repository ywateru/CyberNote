# Account109 整合候选检查点

2026-11-13。本记录区分已执行的代码检查、候选构建与尚未通过的产品验收。完整目标仍进行中。

## 已执行

| 检查 | 结果与边界 |
| --- | --- |
| 主线认证 crate | 15 fixture 通过；显式运行真实只读 Logto discovery 1 项通过。没有用测试 grant 替代产品授权。 |
| 主线原生账户 | `61c3f934` 上 8/8 通过。随后前台恢复修复在作者工作树账户 9/9、手工 adapter 7/7 通过；反例在旧实现确实失败。 |
| 主线同步 | 32/32 通过，含真实 Store/Session、加密流与附件回归。 |
| 主线前端 | 类型检查通过；原生 opt-in 能力检查 10/10 通过。 |
| 主线发布输入策略 | export/policy/build-info 共 9/9 通过，覆盖明确的 first-party 和 runtime asset 声明反例；这不是最终发布批准。 |
| 最终服务部署 | READY，health 200、固定四 scopes、公钥 JWKS 200、匿名 profile/enrollment 401。详见工作区检查点。 |

## macOS 候选与实际启动尝试

候选源码 `c7b18541a6d86adcb6b7c755c6a4a96aaa5f8fc8`，静态前端源码 fingerprint `90e542d5a1dd28efbacfab85b84a160e181dd01fce7e5f6f5f83f9d12b212f1b`，512 个产品输入，构建时 Git 工作区干净。

```sh
NODE_ENV=development VITE_NOTES_DEBUG=1 VITE_NOTES_ACCOUNT_NATIVE=1 pnpm build
CARGO_TARGET_DIR=/private/tmp/cybernote-account109-target CARGO_BUILD_JOBS=2 \
  CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 CARGO_INCREMENTAL=0 \
  cargo build --manifest-path src-tauri/Cargo.toml \
  --features sync-e2e,tauri/custom-protocol --locked --offline
```

两项构建均通过。二进制 SHA256 为 `c651bb3e529f608c71554a9c386b1307f3a8d12553fc57aa9586d3185ac85ae4`。这是显式启用原生账户入口和既有 sync-e2e 驱动的 debug 测试候选，不是正式发布包。Vite build-info 的 `mode=production` 仅来自 build command，不能据此宣称前端 debug API 被排除。原生授权与同步走真实模块，未启用 JS IPC fixture。

已创建两个空的独立桌面数据根，避开默认用户库。第一次启动实际原生进程后，驱动在规定 45 秒内未收到可交互 ready，返回 TIMEOUT；没有继续第二端登录或发起授权。关闭阶段也返回 TIMEOUT，随后确认候选进程已退出，未留下后台进程。该尝试不判定为 AUTH-01 或其他真实用例通过。

同一时点原生桌面工具明确返回：Mac 已锁定且自动解锁失败。因此真实可见交互验收需要用户解锁；锁屏状态本身不是代码功能通过或失败的证据。独立网络探测还显示，正常主机解析访问 Logto discovery 为 200，但 canonical Vercel 域名 TLS 连接被本机网络路径重置。仅使用当前公共地址、canonical hostname 和正常 TLS 校验的独立 curl 探测成功；产品没有加入 IP pin、DNS 或 TLS 绕过。该网络前提也需在产品验收前恢复。

候选构建之后若认证修复或许可闭包发生变化，需要记录更新后的源码身份并制作新候选，不把旧二进制记录套用到新源码。

## 尚未执行或尚未完成

- 产品内真实托管登录、双桌面账户自动发现和完整 document/plainText/附件原字节比对。
- Android 隔离账户测试包的真实登录回跳和三端同步。原用户应用及旧 Sync108 合成测试包保持原地。
- 独立审阅发现的空 refresh token、安装包身份、许可归档和 stale stamp 问题的最终修复复核。
- 最终许可证闭包、精确源码清单、新历史导出和远程 GitHub Actions 实际包构建。

验收操作与通过标准继续使用 [ACCOUNT-TEST-CASES.md](ACCOUNT-TEST-CASES.md)。原开发仓库没有被直接推送，未执行最终发布。
