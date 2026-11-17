# 应用内置 MCP 适配器

2026-11-17，承接用户“cybernote-mcp 不需要填写，预置在应用中，开启 Agent 接入后即可调用”的要求。

## 行为

- macOS 应用包内自带 `Contents/MacOS/cybernote-mcp`；构建/开发钩子从同一 checkout、固定 Cargo.lock 构建适配器，复用 `src-tauri/target`。产物暂存于被忽略的 artifacts 目录，不进入产品源码指纹；打包脚本本身纳入指纹。
- 开启接入即启动既有本机宿主，保留客户端授权、有效期、权限及目录边界。授权后即可在应用内测试；外部 harness 首次导入应用自动生成的连接配置即可，无需下载或填写适配器路径。
- 页头保留“启动 MCP 测试程序”。已就绪时直接打开控制台，未就绪时显示缺少条件；手动与批量测试继续走真实 MCP stdio/私有 IPC。
- 原生端解析当前应用可执行文件的同目录适配器，拒绝缺失、非可执行文件及符号链接。前端启动 DTO 只允许 connectionId/workspaceId/grantId；无法指定任意可执行文件或参数。
- 生成配置使用运行中应用的实际包内路径。应用移动位置后重新复制配置。应用关闭后 MCP 业务调用不可用；正常重启沿用已启用状态与有效授权。
- Android 维持既有同步方式，不打包 macOS 二进制，本轮不重装手机。

## 命令验证

不执行浏览器、AX、UI 自动化或模拟器测试；UI 由用户验收。

```sh
node scripts/check-agent-settings118.mjs
node scripts/check-mcp-tester117.mjs
pnpm exec tsc -b
CARGO_TARGET_DIR="$PWD/src-tauri/target" CARGO_BUILD_JOBS=2 \
  MCP_TEST_ADAPTER="$PWD/src-tauri/target/release/cybernote-mcp" \
  cargo test --release --locked --offline --manifest-path scripts/mcp-tester117/Cargo.toml
```

已通过设置/就绪条件与生产回调 63 项、MCP DTO/批量/恢复/原生调用检查 76 项、原生进程/授权生命周期及适配器解析 10 项。覆盖内置适配器缺失与重新检查、自动配置、前端不可传二进制、权限变化、取消、进程回收，以及真实适配器握手→工具目录→隔离 IPC 调用。隔离 fixture 不访问用户笔记，不作为真实用户库写入的证据。旧浏览器 fixture 已更新为内置适配器注入，仅检查语法，未执行。

一次旧 `check-build-info.mjs` 综合脚本在临时 fixture 的 stamp 验证处失败，尚未到其浏览器阶段；它创建未被该 fixture 的 Git 忽略的构建输出，导致 clean/dirty 改变。本轮不以该脚本作为通过依据，最终安装包使用 release 验证器核对实际嵌入前端与源码身份。

## 手动验收

1. 设置 → Agent 接入：页面不再有适配器路径输入，显示内置 MCP 就绪状态。
2. 开启接入，创建或选择有效授权，点击页头“启动 MCP 测试程序”→“连接”。
3. 分别执行单工具、批量只读；需要写入时主动选择批量读写，测试笔记会保留。
4. 复制 JSON/TOML，核对 command 指向当前应用包内的适配器，并在外部 harness 导入后调用。
5. 关闭接入、撤销或过期后应停止调用；已确认提交的测试笔记可在应用中删除。

## 最终交付

- 源码：`515e9f14b34da0047132ef1432ab24e7caf9c006`，构建时 clean；产品输入 1755 项。
- 指纹：`61022feac22ae56735a3317bbf4ebf341c171306d7845c876852bf36608e4945`。
- 版本：0.1.0；真实前端构建时间 `2026-11-17T10:24:35.188Z`。
- [Mac 应用](../../../artifacts/releases/20261117-bundled-mcp119/CyberNote.app) / [ZIP（含字体与 MCP 许可）](../../../artifacts/releases/20261117-bundled-mcp119/CyberNote-Mac.zip)。
- [实际包/嵌入前端验证](../../../artifacts/releases/20261117-bundled-mcp119/mac.json) / [适配器和 ZIP 摘要](../../../artifacts/releases/20261117-bundled-mcp119/mcp-bundle.json)。

主程序与包内 arm64 适配器均通过 ad-hoc codesign 严格验证。验证器核对实际安装包入口、嵌入前端字节与构建身份；应用目录摘要为 `26869d7bb596ee0b09214df3094870f03152a43811dc28867b0b4d88d099e8aa`，适配器 SHA256 为 `956a0866713cbcfc8fdc3ca47d38be5a2e0070a6583aa27e1e510eb70f1742a0`。生产构建通过，保留已有29条原生警告。

直接使用**最终已签名应用包内**适配器复跑原生10项、完整 SDK stdio16项：全部通过。stdio suite 覆盖九工具、实际 Unix 往返、输出/schema/文档边界、凭据撤销、超时、不重试与队列等；完整日志见 [stdio](../../../artifacts/releases/20261117-bundled-mcp119/deployment/packaged-mcp-stdio.log) / [原生](../../../artifacts/releases/20261117-bundled-mcp119/deployment/native-mcp-tests.log)。它们均使用隔离 fixture，不访问用户笔记。

旧版 PID57275 已正常退出，新包 PID63031 已启动并复核仍在运行。AppleScript quit 返回1，但旧进程已正常退出；未强制终止、重置资料库或使用自定义数据目录。见[启动记录](../../../artifacts/releases/20261117-bundled-mcp119/deployment/mac-launch.json)。Android 继续使用已安装的117包。

清理重复 `target/release/bundle`、ZIP stage 和 sidecar 暂存目录，原分配空间共286,531,584字节（约273 MiB）；发布 app/ZIP、回退包、共享 release 缓存、验证日志及用户资料库保留，见[清理记录](../../../artifacts/releases/20261117-bundled-mcp119/deployment/packaging-cleanup.json)。第三方许可清单复用已核对的原清单，其 Cargo.lock 和生产依赖树与本轮逐字节一致；包内 `Resources/mcp-notices` 与交付 notices 同时保留。
