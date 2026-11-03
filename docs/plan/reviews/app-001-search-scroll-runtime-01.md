# 原生搜索快捷键与长查询独立运行复验 01

2026-11-03，verify 独占 Mac，按交接的同一冻结包完成一次最小实际操作。范围仅包括搜索快捷键、短查询续输、长查询跟随与清除；没有重跑关闭、IME 或全矩阵，也未修改产品源码、构建或安装。

## 身份与证据

- 应用：`/private/tmp/notes-search-scroll-56d7e05.app`。
- 实际可执行文件：`Contents/MacOS/notes-clone`，15,534,976 bytes，SHA-256 `56d7e059437690fa000a1e69a01fee24f1595eed69e9acf287c694098a2eff9a`；启动前独立读取文件身份，运行中 `ps` 读回 PID 5268 的精确该路径。
- 交接给出的源码来源为 `5a5669f` + `444f03b`，99 输入 aggregate `9d27cd8592fe291e2513961137bca643f71fd9ef5b419056404015bdbb182e7f`。本轮未重新构建或独立核验整个来源 manifest，运行结论绑定上述实际包身份。
- 原始 AX、全窗口 PNG、查询值、进程/窗口读回、结果与 SHA-256 manifest：`docs/verification/qa-native-search-scroll/run-56d7e05-independent/`，25 文件及 manifest。

仅打开既有合成 `QA FIX02 34223AF MacABC Beta Gamma local owner`，没有创建、删除或编辑笔记；8 份操作后的完整可见正文 AX 值一致。未操作原版 Notes 或 Android。原生 UI 输入全部通过 CUA 的真实点击/键盘；没有 DOM 注入、setValue 或脚本改查询。

## 实际结果

| 操作 | 实际观察 | 本轮结果 |
| --- | --- | --- |
| 正文聚焦 → Shift+Command+F | AX 焦点仍在正文，顶部搜索为空 | pass，仅证明该上下文没有触发全局搜索 |
| Option+Command+F | AX 焦点转到原生“搜索备忘录” | pass |
| 输入 `QA`，再输入 ` FIX02` | 完整值依次为 `QA`、`QA FIX02`，搜索焦点保持，结果标题分别显示 12 / 1 个备忘录 | pass |
| 全选替换为 211 字符合成长查询 | AX 值完整；实际截图右端可见 `…cdefghijklm-END56D7`，插入点在末尾 | pass |
| Command+Left | AX 值保持完整；截图可见开头 `QA56D7-HEAD-01abc…`，插入点在最前 | pass |
| Command+Right → 输入 `-TAIL` | 完整 AX 值严格等于原串追加 `-TAIL`；截图右端可见 `…hijklm-END56D7-TAIL` | pass |
| 点击原生 clear | 查询为空、恢复“搜索”占位、clear 消失、原文件夹标题恢复，搜索焦点保留 | pass |

长串头、尾的判定同时依赖截图中真实可见内容与 AX 全值，未以 AX 包含全文推导已经滚动到端点。原始证据依次为 `02-old-shortcut` 至 `09-clear`。

## 限制与交接

**蓝色焦点环仍实际可见，视觉一致性维持 FAIL；本次没有像素对齐比较，整体像素一致性仍 unknown。** 这 7 项交互 pass 不能升级为原生顶部全矩阵、整个 APP-001 或苹果备忘录完全一致。搜索零结果时仍打开先前合成正文是本轮观察到的状态，本轮未将其作为搜索结果选择/关闭行为验收。

清除后真实 Command+Q，CUA 返回 `App quit`；随后 `ps -p 5268` 空输出、exit 1，窗口 collector 中无 `com.local.notesclone`。未取得进程本身的退出状态，因此不声称 exit 0。Mac GUI 已明确释放给 root/native；后续 root 再授权附件基线时可重新占用同包。为本轮启用了 20 分钟的有期限防休眠 assertion（session 72395），未修改永久系统设置；Android emulator session 73263 保持原状，未触碰。

独立报告与证据交 root 统一保存；verify 未运行主工作树 git add/commit。
