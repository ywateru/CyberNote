# 文件夹修复18准确包与有限运行根接收

2026-11-05。根已阅读不同作者报告、核其封存索引及实际安装包身份，接收geometry15的有限实包尺寸、hydration16的false回填路径和mobile17的两项已观察交互修复。整体跨端功能、原版交互全矩阵及像素一致性仍未完成。原版删除/恢复实验按用户“先不删除，继续其他开发”保持暂停。

## 准确交付身份

两个包来自同一固定源de372d31e0578a7f2619413c0abde6a8439bb3c6。离线canonical freeze/run/collect依次完成、输入保持，根复核每份freeze1336文件和25 AAR模型，随后不同作者分别470/385项包检查通过。历史失败和旧prior-outputs保持，本次不将旧字节作为新产物来源。

| 平台 | 产物 | SHA256 |
| --- | --- | --- |
| Mac | artifacts/unified-candidate06/mac-folder-fixes-build10/mac-attempt01/mac-sealed.zip，4,866,538B | 6961ea84ef4f9c047a72c119f3417218400a0beaa2bda6d42beef05351b4dc29 |
| Mac | 对应mac-sealed.app主可执行，16,298,512B | 56742e3842b3e3aca03a3bbd3f7fed92f017d5446578334dd7a6cf1b861e1d67 |
| Android | artifacts/unified-candidate06/android-folder-fixes-build06/android-attempt01/android-original.apk，179,247,354B | 8609231ff310ffef028c62b20f9774bcb2968f15d21a95ddf87d3f4eb98951ac |

Mac为本地adhoc衍生完整bundle，deep/strict通过；原linker签名失败原样保留，不是DeveloperID/公证。Android仅arm64、25模型、同升级证书；保数据install-r后设备base.apk记录同SHA，userId10169/firstInstallTime保持。详见[Mac包独审](../plan/reviews/mac-folder-fixes-independent10.md)、[Android包独审](../plan/reviews/android-folder-fixes-independent06.md)。

## 有限实际结果

[Mac运行18](mac-folder-fixes-runtime18/README.md)使用Computer Use准确完整路径。普通表单实际包络800×414、智能切换和取消端点、false保存/重开/只改名/正常新PID后保持、正文真实选区、侧栏按钮和动态菜单两条恢复路径均有保存AX/JPEG。旧PID38681→退出精确进程空→39153，同exeSHA；原始67文件及62项[不同作者静态复核](../plan/reviews/mac-folder-fixes-runtime18.md)通过。栏宽回程未精确复位，临时取消名称输入和完整拖动轨迹仅作者叙述，不外推精确复位或所有中间帧。

[Android运行18](android-folder-fixes-runtime18/README.md)使用已明确授权ADB。准确新包保数据升级，false名称改-R2与强停新PID后仍不包含；目录长按不选字，正文smart仍有系统选区；空标签错误即时与滚动后可见，合法选择清错、回顶确认后取消无新增可见目录。本篇合成note置顶智能1→0、恢复未置顶后1，全部/普通保持8。旧录音卡日期19:52和2:03可见，未播放或导出。PID25977→stop空exit1→26347；原始83文件/37 PNG及99项[不同作者静态复核](../plan/reviews/android-folder-fixes-runtime18.md)通过。21部分点击未确认和29过渡帧保留，只用后续有效端点。

根对两个包独审、两端原始/独审和研究19共7个索引再次逐项核SHA/字节：214条索引记录全部匹配（含跨索引重复引用，不是214个唯一文件），见[根身份记录](folder-fixes-runtime18-root-identity.json)。独立静态审查验证保存记录相容，不冒称审查者亲自操作设备或完整数据审计。

## 后续差异

[研究19](mac-ordinary-form-pixels19-research/README.md)确认普通Mac表面/角部/checkbox/焦点/文字左缘仍有差异；[任务20](../plan/tasks/app-mac-ordinary-form-surface20.md)先限定表面，已对齐布局保持。CUA原始是JPEG、原版独立表单与DOM模态背景不同，不授全像素PASS。

Mac18重启后侧栏回visible。[原版正常重启补证21](../research/mac-sidebar-restart21/README.md)已观察原版隐藏偏好在新PID保持，原版最终恢复visible；这是新确认的克隆差异，后续单列状态记忆修复，不将既有恢复入口故障关闭结论扩张为完整侧栏原版一致。

未重置/卸载设备、读取用户DB、删除实体或导出媒体；计数/可见正文和卡片只支持有限保全，不能代表所有笔记/媒体完整。日期规则、IME/多窗完整矩阵、实际iOS宿主和未覆盖原版手机状态、精确栏宽、动画与整体像素继续open。

Git整包diff whitespace检查只报原始AX、package dump和build日志的尾随空白/末空行；这些是封存原始工具字节，保留原样。Markdown/Python/JSON检查通过，没有为消除格式提示改写原始证据。
