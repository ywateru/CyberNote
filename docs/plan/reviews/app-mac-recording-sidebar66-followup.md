---
id: app-mac-recording-sidebar66-followup-review
status: passed-with-scope-limits
source: f4a2fba7b5d1fda854b3bc802a629a6e1045c7f4
independent-product-mapping: 8be1427bccf633d55886bc479e50a1ce4f519324
baseline-review: bd6172ebd6cf4a9635edce7ddc02e9d64345c093
---

# Mac recording sidebar66 independent follow-up

2026-11-05。准确f4a2fba7修复在本次受控独审边界内PASS，原两项P1均已闭环，没有剩余阻断发现。允许root按准确最终集成源进入Mac19构建及有限实际运行，不能把此结论推为真实麦克风、Mac18现场、OS窗口事件或像素通过。

原11c73a91的blocked报告与attempt01-06、原index均保持不变，见`docs/plan/reviews/app-mac-recording-sidebar66.md`。原索引包含当时runner版本，以bd6172eb的Git对象读取；本follow-up的新runner和新证据另建索引，不改写旧失败。独审树仅cherry-pick已提交修复f4a2fba7为8be1427b，没有独审生产修改。全部271项src/src-tauri/plugins及依赖清单路径/字节与作者f4a2fba7完全相等；`source-binding-f4a2fba7.json`记录完整SHA256。

## P1闭环

**登记回复丢失：** App在首次调用前固定原session/op并保留错误ticket，显示可见重试与明确无音频取消。native只对实际同owner、当前incarnation、同session/op、尚未started/ACK/final的活动登记返回同一身份，退出期间也允许这一精确恢复；跨窗、陈旧、已开始和已完成身份仍拒绝。独立实际App测试分别从丢回复到“重试准备录音”、直接“取消准备录音”、Quit自动空取消，都使用同一组session/op，清空原native替身登记，无stream、无store，release精确saved=false/revision0。

**等待准备期间关闭：** 空Panel在首个await前dispose并封新采集。独立实际生产Session在native-start响应、authorize、getStream三个等待点关闭，均无需放行等待点便完成空取消。随后放行：native-start和authorize不取得stream，getStream迟到只stop track，全部零recorder start、零附件store。原baseline“关闭后才开始采集并插卡”的反例不再发生。有已开始音频的正常close仍走final保存，未走空取消。

## 独立验证

`docs/verification/mac-recording-sidebar66-independent/fix-attempt01/result.json`：17组PASS，pageerror=[]；这是新修复的首次独立浏览器运行，无失败重跑。挂载实际App/SearchEditorHost/NoteEditor和TipTap/SearchGate/useEditorCommit/SaveQueue/bridge，直接DesktopPanel与实际DesktopSession/PCM/Revisions均参与。App只在最终return前插入访问器；useEditorCommit仅在原requestCommit之前增加一次性观察/故障回调，原调度和校验未替换。

- 登记丢回复的可见恢复、直接取消及Quit取消三组；重复登记严格保留同session/op。
- 三个准备等待门的close及晚到资源释放。
- 首次暂停及两次累计：同一A Editor/ticket，切B后A停车且B可编辑，一个stream、两个分段、两次store，A追加正文/B编辑均保留，唯一录音卡且query committed。
- final已存而cleanup失败后只重试cleanup，store/native revision/body计数均不增加。
- checkpoint在途时busy close/reentrant close共享同Promise，等待checkpoint、final和cleanup。
- 主窗close故障保留窗口并恢复合法编辑，再次close等final+flush后destroy。
- Quit过期/取消后的迟到final不发送过期success ACK。
- 正文Escape保留侧栏、侧栏Escape执行final关闭。
- 实际Host commit等待期间external version、owner、access epoch或blocked变化分别拒绝、保持A和待存音频，不store；真撤权另测拒绝且保留。

`native-fix-attempt01/`：独立5组原生core测试PASS。提取准确生产Registry structs及12个纯函数，序列化derive和Tauri命令包装不参与编译；函数正文逐字未改，真实uuid使用已编译生产依赖并绑定哈希。独立用例覆盖精确未started登记失回复恢复（包括Quit）、started后拒绝、跨窗/改op/新session/owner销毁拒绝、每owner唯一、空cleanup仍等全部document seal和准确ACK、过期Quit不能借迟到final退出、checkpoint不得release以及final清理receipt与后继会话保护。生成core、runner、编译及运行stdout和源码哈希均保存；测试可执行文件保留本地且另记身份，不加入Git或索引。没有再次全Tauri编译，原生槽已释放。

独立pnpm typecheck exit0。8个关键保留文件相对11c73a91逐字节不变：手机RecordingPanel/session、DesktopSession/PCM、Editor/SearchGate/commit hook/SaveQueue。作者182617db的31项证据及8da6d248修复证据所有列项，另由Git对象逐项bytes/SHA256核对一致；这是作者证据身份检查，不把作者结果当作独审通过。

## 权限核对

准确f4a2fba7的`src-tauri/capabilities/macos-notes-ui.json`与989f23e5逐字相同：platforms为macOS、windows为main/note-*、permissions包含notes-ui:allow-recording-access。删除旧child专用macos-recording-access capability没有造成主窗口/独立note窗口的麦克风预检权限缺口，**无需扩权**。物理窗口/TCC/签名/应用标识未由本次修复放宽。不要仅看已删除的child专用capability就推断main缺权限。

## 边界与未覆盖项

独立浏览器的IPC、后端持久宿主、native授权、stream/recorder/解码/回放是受控边界；实际DesktopSession/PCM算法参与，但不据此声称真实编码器或音质。平台设Linux以不挂mac toolbar，native路径为true；authorize作为受控环境入口验证，不宣称实际Mac TCC预检已测。作者19组使用显式native marker/Mac平台与真实Chrome合成MediaRecorder，属于其单独证据。

本轮独立未增加搜索/系统菜单/真实焦点全矩阵；A/B真实Host停车与B可编辑已测，原作者42组的搜索和焦点作为11c基线作者证据保留，未追认为f4全重跑。原生core不运行Tauri command wrappers、真实窗口销毁或操作系统退出；实际red close/CmdW/CmdQ仍需root Computer Use。未打开/关闭/重载Mac18真实约3秒录音、手机原13秒音频、设备、模拟器或原版数据，没有导出或转写音频，没有包/签名/像素动作。所有缓存原地保留且排除证据索引。旧浮动/停靠模式未扩测。
