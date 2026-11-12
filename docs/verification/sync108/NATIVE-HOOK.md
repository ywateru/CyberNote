# Native driver integration

Startup 的独立可审提交为 `2a34faf0`。工具提交 `0897543db8b6246497fcfba0f93c9157b0903732` 已原样 cherry-pick 为 `5500c94a`；本次整合只添加 Cargo `sync-e2e` feature、相同 compile cfg 下的模块声明和 setup 最后的 `start(app.handle())?`。

2026-11-12 已完成：

- `NODE_ENV=development VITE_NOTES_DEBUG=1 pnpm build` 通过。
- `CARGO_TARGET_DIR=/private/tmp/cybernote-sync108-target cargo build --manifest-path src-tauri/Cargo.toml --features sync-e2e,tauri/custom-protocol --locked --offline` 通过。`custom-protocol` 嵌入上述静态前端；没有连接 localhost:1420。
- 用 Node `NativeApp` 启动一个新临时目录的真实原生进程，执行 `ready → app.state → shutdown`。实际返回 `location=tauri://localhost`、`native=true`、`window=main`，读到真实 workspace，经过 `app.flush`/`waitForIdle` 后自然退出，code 0 / signal null，无强制信号；自有工作区和哈希缓存已清理。

随后将 Dewey 的 Ready 修复 `af1ac64a38a2630af76b9e363629ab4509fd0856` 原样 cherry-pick 为 `7a64e3b14f5c970038d1817717c35a5bb90702e7`，只重新编译 feature binary，复用完全相同的静态 debug 前端（没有合入仅影响 browser 测试工具的 `845f2181`）。最终原生握手还断言了 `interactive=true`、`startupDetached=true`；另一次真实 DOM 读取确认 `#root` 存在、启动层已移除、inert 属性/状态及 aria-hidden/aria-busy 均已解除。最终 SHA256 为 `11b2f4041b77cce3c83a81ac7f03f28ebc7e3e6dcf8feccda077f8fe29f147d4`，最新 `native-build.json` 已替换为此次构建及自然退出证据。

产物为 `/private/tmp/cybernote-sync108-target/debug/notes-clone`。精确 binary/source/static frontend 哈希、构建命令和单进程握手记录见 [native-build.json](native-build.json)。该产物是 debug + feature 测试构建；compile cfg 同时要求 `sync-e2e`、`debug_assertions` 和 `desktop`，运行时还要求 `NOTES_SYNC_E2E=1`。普通 debug 没有该 feature；release 即使误带 feature 也不编译该模块。

后续 Dewey 执行原生双端 suite 的入口：

```sh
cd /private/tmp/cybernote-sync108
node scripts/verification/sync108-native.mjs \
  --binary /private/tmp/cybernote-sync108-target/debug/notes-clone \
  --root /private/tmp/cybernote-sync108 \
  --build-record /private/tmp/cybernote-sync108/docs/verification/sync108/native-build.json \
  --output /private/tmp/sync108-native-suite-FRESH
```

output 必须全新。本次整合没有执行双端业务 suite，也没有新增 driver 业务逻辑；这份握手记录只证明静态 debug 前端、原生 eval/event、真实 state 和自然退出接线。Startup 的 227 passed / 4 ignored Rust 全库回归与三个实际原生启动进程证据另见 [startup/README.md](startup/README.md)。保留此前构建的无 driver、生产前端 debug `.app`，位于 `/private/tmp/cybernote-sync108-target/debug/bundle/macos/CyberNote.app`；它与当前独立 binary 的 feature/前端不同。
