# 本地 OCR 文字确认

本页是APP-004-OCR-HOST-01工程界面。用户录屏已保存在references/mobile，但没有显示识别完成预览；下述几何与交互是实现契约，不能当作原版取证或像素通过。已取证入口/Android相机继续以android.md与插件说明为准。

## 结构

```text
┌──────────── 扫描文本 ────────────┐
│ 在此设备识别图片文字，确认后插入原备忘录。│
│ [从图片识别文本…] [拍摄文字 Android] │
│ 处理状态 / 实际错误                    │
│ ┌────── 实际识别文字预览（滚动）──────┐ │
│ │ 原样文字与空行；不解释 HTML       │ │
│ └───────────────────────────┘ │
│                    [取消] [插入] │
└─────────────────────────────┘
```

打开前固定原note、Editor、文档/版本、选区书签、授权stamp和operation；面板不可改目标。Mac原生菜单“从图片识别文本…”通过recognizeImageText进入同一路径，Continuity未提供能力继续禁用；手机“扫描文本”复用同控制器。

## 操作与状态

- choose：Mac只选择本地图片；Android图片选择或文字相机。系统选择取消明确返回可重新选择状态。
- processing：实际插件处理，插入禁用。取消先封住插入，等待已打开相机/选择页完成返回及原生终态。
- recognized：原样显示实际非空文本，确认插原选区，一次事务。empty/failed明确显示并禁止假插入，可取消后重新开始。
- confirming：等待实际正文保存；失败保留同结果/同正文，按钮“重试保存”，不重复插入。
- saved/cleanup-pending：正文已真实ACK；仅清理私有暂存。失败显示“文字已保存”与“重试清理”，正文不倒退。
- Escape、Android Back与取消走同控制器；切笔记/访问prepare/卸载/关闭封住入场并清理原会话。未ACK正文保留并报错，不能静默删掉。

## 布局与输入

遮罩z-index110；面板最大宽520px、视口安全区内居中，外围至少20px，内边24px，圆角18px。颜色沿现有paper/ink/secondary/grouped/line/accent/danger变量。文字pre保留换行、任意长词换行，最大45vh并可滚动；按钮最小高44px。尺寸为工程值，未取证。

打开聚焦标题；Tab/ShiftTab限制在当前可用按钮和文字预览；Escape阻止冒泡后取消。选图回调捕获已渲染的operation，旧File回调不能提交到新操作。打开前编辑器失焦，不主动弹IME。

授权prepare、最终clearSensitive/commit和卸载同步清空React预览文字及错误；封住回调后隐藏，晚返回不回填。正常完成/取消也清空无主预览。prepare若abort，未ACK正文与原操作恢复身份仍保留，不能用清UI缓存代替丢弃待保存正文；只有取消/清理真正终止后才清Host结果文字。

## 组件和验证边界

App拥有原目标与真实保存ACK，OcrHost拥有会话/事务状态，ocr-native只调用现成typed guest，OcrPanel仅显示状态/发用户动作。320×568与390×844实际挂载组件的滚动/44px可达/文字转义/键盘检查见verification/app-004-ocr-host/source-candidate-01/。受控props和合成File不证明真实主App、OCR引擎、物理相机、设备安全区或原版像素一致。
