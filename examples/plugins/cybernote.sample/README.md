# CyberNote 示例插件

这是一个**声明式**插件示例。它只提供清单、宿主渲染的界面区块和一个设置项，
不包含 JavaScript、可执行文件、安装脚本或本机权限请求。

## 安装方式

### 1. GitHub 子目录

在 CyberNote 的「设置 → 插件 → 从 GitHub 安装…」中输入：

```text
https://github.com/ywateru/CyberNote/tree/main/examples/plugins/cybernote.sample
```

### 2. 本地 ZIP

在仓库根目录运行：

```sh
pnpm plugin:package
```

然后在「设置 → 插件 → 从文件安装…」中选择
`release-packages/cybernote-sample-plugin.zip`。

## 观察到的行为

1. 安装完成后插件保持关闭。
2. 在插件详情中启用后，会出现「示例插件已加载」区块。
3. 关闭插件或「显示示例面板」设置后，该区块隐藏。
4. 卸载会移除插件文件和设置，不影响笔记、附件、备份或远端数据。

## 清单约束

- `manifest.json` 必须位于 ZIP 根目录或单一顶层目录；GitHub 安装可通过
  `/tree/分支/子目录` 指定。
- `id` 使用反向域名格式。`cybernote.*` 由应用保留，外部包不能覆盖内置插件。
- `manifestVersion` 和 `apiVersion` 必须与宿主兼容。
- 外部插件不能申请权限，不能包含 `.js`、`.wasm`、原生库、安装脚本或页面文件。
- 单个文件不超过 8 MiB，展开总量不超过 32 MiB，文件数不超过 256。
- `ui.sections` 只接受 `plugin.detail` 槽位；正文按纯文本渲染。
