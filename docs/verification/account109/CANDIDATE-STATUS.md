# Account109 整合候选检查点

2026-11-13。本记录区分已执行的代码检查、候选构建与尚未通过的产品验收。完整目标仍进行中。

## 已执行

| 检查 | 结果与边界 |
| --- | --- |
| 主线认证 crate | 空 RT 修复后的 `3bd36935` 上 18 fixture 通过，0 失败、1 项 discovery 默认忽略；此前另显式运行真实只读 Logto discovery 1 项通过。没有用测试 grant 替代产品授权。 |
| 主线原生账户 | 前台恢复修复后主线账户 9/9 通过，作者手工 adapter 7/7 通过；反例在旧实现确实失败。 |
| 主线同步 | 32/32 通过，含真实 Store/Session、加密流与附件回归。 |
| 主线前端 | 类型检查通过；原生 opt-in 能力检查 10/10 通过。 |
| 主线发布输入及打包策略 | 完成 notice、包内身份、stamp 及新历史验收修复后，publish 测试共 15/15 通过，0 跳过；这不是最终发布批准。 |
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

## 独立审阅闭合与许可收拢

- 空 refresh token：`3bd36935` 拒绝把空字符串保存成 owner；初次授权回退撤销非空 access token，刷新保留旧的非空 refresh handle 并隔离无效响应，不交付新 access token。新增测试检查实际撤销表单、失败保留、重启清理及普通缺省 RT 继承。原审阅者 Tesla 已按原作者提交 `e15920c7` 与主线文件哈希重新静态复核，接受关闭；主线独立运行 18 项 fixture。静态复核没有被写成真实登录执行。
- 发布工具三项 P2：主线 `3273b739`／`efb10f8b` 逐段 NOFOLLOW 验证 notice 的路径和字节，ZIP 使用已验证 bytes；重新计算当前 source identity 并核对实际包内 raw/Brotli build-info；拒绝 stale stamp 的 dirty/count 不一致。原审阅者 Pauli 在对应作者提交 `15eea91a`／`38646405` 的精确快照运行 8 项定向测试，并独立复跑原 traversal/hash/symlink、旧包身份和 stale dirty 反例，接受三项关闭。该复核不包含新历史验收或真实包构建。
- SDK 许可：`69a9e336` 原样保留固定上游 `f2a3961536e5c69b13c7dbc661953d9243becbae` 的 1,139 个 SDK notice/license 文件，共 4,617,475 bytes。主线逐文件核对路径、长度、SHA256 和 Git blob 身份全部通过；完整来源清单见 `native/sdk-license-closure.json`。provider 和 SDK 自身许可分别保留，原始上游字节未格式化。
- 新增集成依赖许可：另从 Cargo.lock checksum 验证通过的 crates.io `.crate` 归档提取 oauth2 5.0.0、openidconnect 4.1.0、opener 2.7.3 和 deep-link 2.6.3 的 9 个原始许可文件。它们保留在独立的 `scripts/publish/notices/rust/`，来源和哈希见该目录 `NOTICE.provenance.json`；没有修改 SDK pin 或把外部依赖称为项目自有代码。该补充只覆盖明确列出的新增直接依赖，不宣称整个项目传递依赖法律审阅已完成。

## 尚未执行或尚未完成

- 产品内真实托管登录、双桌面账户自动发现和完整 document/plainText/附件原字节比对。
- Android 隔离账户测试包的真实登录回跳和三端同步。原用户应用及旧 Sync108 合成测试包保持原地。
- 最终精确源码清单、新历史导出和远程 GitHub Actions 实际包构建；新增许可文件还需纳入最终导出及 notices ZIP 复验。

验收操作与通过标准继续使用 [ACCOUNT-TEST-CASES.md](ACCOUNT-TEST-CASES.md)。原开发仓库没有被直接推送，未执行最终发布。
