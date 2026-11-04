# 普通 Mac 文字绘制31独立证据

2026-11-05，verify_app；**PASS，SOURCE SCOPE ONLY，READY STOP**。正式结论见[独立审查](../../plan/reviews/app-mac-ordinary-typography31.md)。

固定提交`e687ea6ceaa02c57e511c4a97a6187cba5f5acf0`；唯一产品CSS SHA `7e7a7bfa274858cbb1449e55e96026427dfa398489613dc60592e2608dc48005`。作者78项索引SHA `053500ca106618985f9802c4b4ac4f33b05dfda201c54232e9652cb53f75da26`。本目录的[verify.py](verify.py)独立核对精确补丁、固定身份/封存索引、生产fixture、自然与选中诊断元数据，直接从原JPEG/ICC和原始WK PNG重算固定ROI的所有阈值、bbox、误差及像素比较。最终[verification-result.json](verification-result.json)为312/312通过。

有限fresh运行只使用既有离屏WK工具、封存生产SmartFolderForm/full-CSS fixture及本目录两个独立探针，未生成正式应用包：

- `fresh-baseline-native-attempt02.*`、`fresh-candidate-native.*`：自然未选图。表单均与作者对应输出800×414逐RGB零差；两个浅色ordinary选择器仅使四个节点继承的smoothing变化，所有外部rect、文本和其他computed保持。
- `fresh-isolation.*`：11项不同输入替换/往返/取消与范围外隔离检查通过，完整computed和`::selection`保留在JSON；未把页面脚本事件当成OS键盘，也未把fixture取消计数当成App卸载。
- 三次成功运行均inactive/unattached、无可见/key/main窗口，无资源请求和fixture errors。`*-command.json`保存固定参数和工具结果；成功结束的session记录已补入command。

原不利结果与诊断边界全部保留。自然名称统一caret排除、选中诊断class、JPEG/ICC与宿主AA差异、仍有48像素raw160覆盖差的选中名称均不能转授为完整像素通过。仅黑色和geometricPrecision的不足结果未删除。

首次受限执行的`fresh-baseline-native-command.json`保存exit1/system-service限制，不覆盖；随后使用窄权限运行同一helper完成三次有限检查。`verification-result-attempt01.json`与`verify-attempt01.py`保留首轮311中310通过的验证器假设：原本要求compiled bundle完全相同。[fixture-bundle.diff](fixture-bundle.diff)显示唯一差异为作者已披露的html.dark适配。最终检查只允许该精确行，并另核真实App的documentElement主题切换，未忽略其他差异。

[protected-inputs.before.json](protected-inputs.before.json)固定468项产品与证据的当前身份；[protected-inputs.after.json](protected-inputs.after.json)和[integrity-result.json](integrity-result.json)记录收尾保持。作者initial315相对当前仅CSS与根任务结果更新的task31说明不同，产品303仍仅CSS变化。本次只新增本目录与独立审查文件，不改变原证据、产品或共享文档，不修改Git。

[evidence-index.json](evidence-index.json)封存本目录其余文件及审查文件，排除索引自身；索引SHA由交接消息提供。准确新Mac包与活动窗口Computer Use仍待后续，不授父目标或完整像素完成。
