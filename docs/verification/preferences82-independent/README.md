# 82独立源码与精准DOM验证

**PASS / SOURCE-READY**，产品 `8fd3e35f`，证据head `dd1d19fd`，125项输入指纹 `7a7025e49d58a4846ee6a4d984833b88c4723c9043b1859d9611fba3e4ce6ac7` 前后相同。独立32项自然exit0，完整外层12.480735s，内部12.373666s。完整源码边界与结论见 [审查报告](../../plan/reviews/app-preferences82.md)。

此次使用独立驱动，未调用作者52/50整组。覆盖设置失败/重试、真实gear/单壳/lazy、hidden操作拒绝、snapshot/query/page/scroll与exact DOM身份保持、后台导出错误/取消/焦点、BODY Escape/Tab/unmount、隐藏authority和迟到inventory、真实App native overlay、mobile合成录音不中断/owner保持/Back优先/备份禁用，以及320短屏。

- `run-focused.mjs` 是最终真实执行驱动；`focused-command.json` / stdout / stderr 保留准确命令与完整自然退出。`final/result.json`含全部32项、runner SHA、运行边界。
- `final/source-before.json` / `source-after.json`为前后身份；`frozen-source-identity.json`将8项未变controller/原生/model输入逐字映射已通过80/81结果，不重复Cargo/AppKit。
- `final/desktop-recovered-data.*`、`mobile-short-data.*`为PNG与HTML文本/必要快照；`native-projection.json`记录实际App/guest到模拟native IPC投影。`preservation-map.json`逐文件保全临时原件bytes/SHA。
- `attempt01/02/`及各自`attemptNN-run-focused.mjs`、命令/stdout/stderr保留驱动真实失败。01为busy文本变化导致旧名定位超时（自然1/17.170247s）；02为故意失败错误态idle正确APP_ERROR但驱动未接收（自然1/9.027877s）。产品未为这两次失败修改，最终只修驱动定位与明确接收预期错误，不追认为通过。

真实React/App/DOM/Tiptap/录音会话，backend/媒体/存储/选择器/native IPC为显式合成边界。这里只证明程序化交互与本轮少量几何，不证明实际OS/Android/完整WKWebView渲染或原版像素。未使用真实麦克风、设备或用户数据，原Android未保存录音保持。runtime全部cleanup，候选index/dist交还，未stage/commit。
