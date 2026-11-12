# 真实 Rust 授权 owner 与部署 profile 验证

2026-11-13。运行使用生产 `AuthClient`、产品 loopback callback 和真实 Logto/Vercel 服务，未使用 fixture transport 或注入 grant。此验证不操作产品账户 Runtime，也不证明 App、enrollment 或多端数据同步通过。

## 候选与运行

源码为 `b5df1e53000709c9a1b3e8e2337ba8e5ffeee0c6`。编译与运行时，认证源码、独立 Cargo manifest/lock、示例和 callback 文件逐一与该提交字节一致；工作区另有测试操作文档修改，未冒称整个 checkout 干净。

```sh
CARGO_TARGET_DIR=/private/tmp/cybernote-account109-auth/crates/account-auth/target \
  CARGO_BUILD_JOBS=2 cargo build \
  --manifest-path crates/account-auth/Cargo.toml --locked --offline \
  --features live-smoke --example live_smoke
```

随后对一个不存在的绝对 owner 目录运行 `live_smoke`。该目录由示例以 0700 创建；测试没有使用默认用户库。二进制 SHA256 为 `e71df6674461dd7228a8f5d4bb14cd909b7bd86ccb26b2f9ffda4bfc7a1411a6`。

示例先绑定产品的 `127.0.0.1:17897/callback`，再开始 Code+PKCE 并打开系统浏览器。本次沿用此前专用合成账号的托管会话，无需再次输入凭据；真实回跳完成后，浏览器页面显示“请返回 CyberNote。”。完整 callback 仅在 Rust 内处理，没有记录 URL、code、state、ID/access/refresh token 或响应 body。

## 实际结果

进程自然退出 0；14 条安全阶段记录全部为 ok。

| 阶段 | 实际证据 |
| --- | --- |
| owner 与 listener | 全新私有 owner 就绪；listener 在授权开始前绑定成功。 |
| 托管授权与 callback | 浏览器实际完成授权；产品 callback 交真实 `AuthClient` 校验并成功提交授权。 |
| 初始 profile | Rust AccessToken 直接访问固定部署接口，HTTP 200；schema、issuer、subject 与授权身份相符。 |
| 强制 refresh | `force_refresh=true` 成功；新 access 调用 profile 再次通过，product/workspace 保持一致。 |
| owner 重开与 restore | 关闭原 owner 后重新取得同一目录的 owner；restore 返回相同 subject/issuer，profile 第三次通过且 workspace 一致。 |
| logout 与本地清理 | logout 成功；随后 restore 为 None、cleanup_required=false，实际 grant 文件不存在。 |

三个 profile 请求均使用正常 TLS、系统 DNS、固定 HTTPS origin、禁止重定向和环境代理，没有 IP pin、DNS 注入或 TLS 绕过。此前出现的 canonical 路由问题在本次运行前已恢复；独立直接、HTTP proxy 和 SOCKS hostname 探测均返回 health 200。

脱敏 JSONL 和源码/二进制指纹 receipt 保存在被忽略的 `artifacts/account109/`。安全输出只含静态阶段标签、状态和连续性布尔，不含真实响应、身份字符串或 workspace 值。结果证明本次真实 Rust grant 的刷新、持久恢复、部署 profile 连续性和退出清理；不等同于服务端立即拒绝所有已签发 access JWT，也不替代产品内注册、双桌面和 Android 自动同步验收。
