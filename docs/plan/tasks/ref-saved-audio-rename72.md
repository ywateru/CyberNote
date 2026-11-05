---
id: ref-saved-audio-rename72
scope: original-saved-audio-rename-behavior
status: in-progress
depends-on: [app-mobile-debug-recording71]
---

# objective

补齐原版已保存录音重新命名的交互证据，为真正实现保存卡菜单提供依据。任务62只证明菜单存在，不能据此猜测编辑器、确认/取消、扩展名和保存后的显示规则。本轮优先明确这一条完整路径，不把追加录音或音频导出混入。

# context

- docs/INDEX.md、docs/requirements.md
- docs/research/saved-audio-menu62/README.md
- docs/ui/recording-desktop.md、docs/ui/recording-mobile.md
- src/Editor.tsx、src/use-attachment-media.ts、src/recording-metadata.ts
- src/bridge.ts、src-tauri/src/store.rs及metadata/attachment模块
- docs/debugging.md、docs/testing.md

# contract

1. 原版目标为本机Apple Notes。仅操作已知合成笔记`QA-TYPE-20261104-01`中任务62观察的既有5秒“新录音”，必须重新核对实际实例、窗口及目标，不能复用旧PID/AX路径或读取其他用户录音。
2. 通过正常界面观察菜单→重新命名→初始字段/按钮/选区→取消；若目标确为上述合成样本，可将名称暂改为明确QA名称并恢复原名，验证可见更新及重新打开后的名称。保留每步准确结果，不能把未执行路径写成通过。不得删除、追加录音、导出/复制音频或读取Notes数据库。
3. 优先使用可用的REA原生UI观察/动作；现会话未暴露Computer Use时可使用针对已确认AX元素的本机辅助功能操作，不修改系统权限或凭证，不依赖坐标盲点。截图权限失败时保留失败，仍可独立取得AX/已存在原图证据，不能把AX当像素证据。遇锁定/不可选目标不反复要求用户解锁，继续支持的源码准备工作。
4. 同步梳理克隆的持久名称、正文节点名称、媒体加载、授权/版本、Undo、归档与调试入口的真实调用链。提出实现需要的最小契约，区分原版观察、工程不变量和未确定项。不能仅给节点加一个本地state标题而绕过真实持久化。
5. 不操作原Android设备/模拟器或其约13秒未保存现场，不请求真实麦克风，不读取/导出/复制/转写用户音频，无网络内容上传。不改变克隆产品代码或构建原生包。

# path

docs/research/saved-audio-rename72/及必要引用索引。研究脚本仅允许保存本轮精确目标的AX/元数据/截图证据；不新增通用读库、任意脚本执行或权限后门。

# verification

报告记录准确原版二进制身份、进程/窗口、动作成功或失败、原始证据位置、已恢复状态和仍未知项；克隆分析列出对应源码位置及持久化/访问边界。研究完成提交并停止修改，交另一agent核对证据。只有实际证据支持的行为才能进入后续开发合同，完整像素与两端产品目标继续开放。
