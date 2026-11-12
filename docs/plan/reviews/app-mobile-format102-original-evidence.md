---
id: app-mobile-format102-original-evidence
scope: bounded-read-only-original-r2-provenance
status: logged-sequence-confirmed-global-write-history-unknown
reviewer: media99_research
---

# 原r2格式面板截图写入顺序审计

2026-11-10。只读核对已知原rollout与保存的操作索引，没有设备操作、构建或新截图。结论：**原rollout明确记录07截图→一次正文长按→08截图→后续点击，属于同一连续case；该日志范围内未发现两图的第二次截图写入。但无法证明所有进程、所有会话的完整文件写入历史，故全局未覆盖性为unknown。** 不因后来的non-reproduction撤回原r2失败，也不据此推测产品修复或根因。

## 可追溯原调用

唯一读取的rollout为已保存 `artifacts/final101-android-r2/format-operation-sequence.json` 指定的：

`/Users/water/.codex/sessions/2026/11/09/rollout-2026-11-09T15-47-35-01a1bf46-e107-7161-83a6-1be92f09b1b0.jsonl`

本次读取快照4261行，末记录UTC `2026-11-09T20:37:16.887Z`。未搜索HOME或其他未知rollout。索引内三条调用的timestamp、tool及完整arguments均逐项准确等于该rollout中的function_call。

| 原调用UTC / 行号 | 可追溯调用与完成记录 |
| --- | --- |
| 15:20:27.353 / 2094 | `call_4c02b714693c494f9ea97c34bccf11ce`：tap `(115,2810)`，随后保存06截图及层级；对应实际打开格式面板的前置操作 |
| 15:21:09.327 / 2101 | `call_d2d5a7938773411bb61a83b6b98f0ab5`：仅 `adb_guard.py screenshot /Users/water/work/2026/Apple-Notes-Clone/artifacts/final101-android-r2/07-format-stable.png`；2103行CommandExecution完成，15:21:10.360，exit0 |
| 15:22:18.208 / 2106 | `call_6d950ec1dfc4472ea24f689dcda83ab0`：view_image读取07，非文件写入；2109行保存对应input_image输出，表明当时已读取07 |
| 15:23:25.479 / 2116 | `call_bda7997a59084c2ab857400051f2d6d9`：先 `adb_guard.py swipe 600 670 600 670 800`，再screenshot保存08，然后才依次tap `(395,2368)`、`(1286,1924)`、`(1115,2810)`；2120行CommandExecution完成，15:23:30.447，exit0 |

三条关键调用属于同一thread `01a1bf46-e107-7161-83a6-1be92f09b1b0`、同一turn `01a1c0d6-00f4-7df3-810d-009063f4f02a`，均以root仓库为cwd。07保存与08保存之间可见的唯一设备输入为上述800ms定点长按；中间view_image是只读。08在同一顺序shell命令中位于三次后续tap之前，因此这些后续tap不能解释08截取前的面板消失。

## 同路径覆盖检查与限制

定向检查该rollout内全部function_call中两张图片准确路径的引用：每张仅发现一次实际screenshot写入。其余相关调用为view_image、读取/搜索既有日志、文件列表及编写Markdown/操作索引，没有发现对这两张PNG的后续screenshot、复制替换或直接write_bytes调用。当前已知 `adb_guard.py` 的screenshot分支为foreground guard后，将 `adb exec-out screencap -p` 结果 `Path(output).write_bytes(...)`；它是覆盖式写入，不提供追加式审计或原件摘要封存。当前脚本不是原运行时脚本的独立不可变快照。

辅助文件事实如下，仅用于一致性核对，不作为完整写入历史证明：

| 当前文件 | 长度 | SHA256 | 当前mtime UTC |
| --- | --- | --- | --- |
| 07-format-stable.png | 105409 B | `3dc1ab9fc5b961c8920aa31b288939e3b6881635f1b41172edd4f06204aae176` | 2026-11-09T15:21:10.355840Z |
| 08-format-selection.png | 87169 B | `d975e80fa84c6dfd91b0e681360a9272502c3e671c316af52694f452ea79a010` | 2026-11-09T15:23:28.140573Z |

mtime落在原调用执行窗口中，但能够被保留或重设；现算SHA也不是原写入时的预封存SHA。该rollout没有全系统文件写入监视；本轮未扩大检查其他会话或进程。因此“原调用连续且本日志中无第二次写入”已证，“从首次写入至今绝无任何外部同路径覆盖”仍是unknown。两者不能混为同一结论。

原r2截图07有面板、08无面板及原调用顺序的有限实测失败继续保留；后续不同前置状态下不复现不能撤销它。本审计不证明根因、不证明任何诊断代码构成修复，也不改变包身份或正式交付门槛。
