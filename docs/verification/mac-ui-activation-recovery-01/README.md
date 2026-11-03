# Mac UI 激活与查询恢复：单次有界能力验证

结论：**没有建立原版前台匹配，激活能力 UNKNOWN，原版查询未清除、未返回 TODO。** 单次 coordinate click 后 fresh AX 仍为搜索零结果，search/cancel 均 disabled；随后只读 NSWorkspace frontmost 为 Codex PID 94949，非原版 Notes PID 696。没有继续输入或克隆激活尝试。

本目录属于新证据，不修改已冻结的 `mac-zero-same-geometry-before-01` 28 项。运行克隆仍为旧 candidate02 PID23532；未启动 candidate03、镜像、Rust 构建或源码修改。

## 授权与实际顺序

root 明确授权：先对原版 fresh 截图安全原生 chrome 做一次 coordinate click，再 fresh AX 和只读 frontmost/key 核同；仅全部正确才清临时查询并回安全文件夹/TODO。若一次坐标仍不正确则停止，不 Cmd-Tab/Dock/盲 paste。允许克隆一次独立能力尝试，但本次原版核对失败后没有继续克隆点击。

1. `cua.getApp('/System/Applications/Notes.app')` 0.1871s 返回原搜索现场；没有后台新启动其他应用。01 保存 fresh AX/2784×1806 PNG。
2. 从 fresh 图选搜索标题右侧空白 chrome，执行唯一一次 `await arOriginal.click([600,35])`，随后 `getAXStateAndScreenshot`，共0.6037s。02 PNG 光标实际落在标题右侧空白，证明本次点击落点可见；不是正文或有内容创建动作的按钮。AX 仍显示原固定查询、search38/cancel40 disabled、selected iCloud全部。
3. 尝试对原版 PID696临时只读 native 观察。Provider 返回 `capability_unavailable / unsupported_provider`，原因 `Unable to access process with pid 696 from the current user account`（03）。没有绕过或再次附着系统原版；原版 key/main/firstResponder 仍 UNKNOWN。
4. 对既有旧克隆 PID23532执行同一只读脚本，仅读 NSWorkspace 和该克隆主窗口的有限元数据，不遍历私有备忘录或其他应用标题。04 返回于2026-11-04 02:55:48.574 Asia/Shanghai：NSWorkspace frontmostBundle=`com.openai.codex`、frontmostPid=94949；克隆自身 active=1/hidden=0、主窗口 visible=1/key=1/main=1、firstResponder=TaoWindow。没有原版 foreground 匹配。cleanup_error=null；临时观察 workflow 在观察窗结束时detach，normalized_result的running本身不作为持续附着证明。
5. 按预定门槛停止。不点击取消、不改搜索值、不选新folder、不paste、不发送Cmd-Tab、不再次绑定Dock、不操作克隆窗口、不更改窗口几何。

固定原查询：`QA-NO-MATCH-20261103-2301-ABCDEFGHIJKLMNOPQRSTUVWXYZ-NEVER-EXISTS-7f62c83e9d4a`。

## 解释边界与后续条件

- 本轮只证明：一次可见安全chrome点击后，后续全局前台观察仍不满足约定匹配门槛。没有持续监测点击当刻，不能排除点击与只读观察之间发生前台切换，不能把原因确定为CUA实现、Notes实现或用户行为。
- App.active/key与NSWorkspace前台指标不一致，需要保留，不能取其中一个判激活通过。
- 原版系统进程不可直接只读附着，属于工具覆盖限制；未绕过系统保护。
- 原版临时查询继续保留，恢复未完成；没有对此声称成功。未写入原版或克隆正文。
- 新包实际键盘、picker、录音与像素验收应先解决并观察稳定输入前提。当前没有可文档保证、且已实测成立的按路径激活序列；不能以DOM focus或其他输入技术替代实际验收。

公开能力文档层核对另见 `../cua-activation-capability-01/README.md`。本目录 native-frontmost-read.js 为只读元数据脚本，无hooks、无UI发送、无页面JS、无文档/选择写入。manifest自身不列入files。
