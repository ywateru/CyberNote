# 图片导出后键盘边界修复

源码修复提交：`ad3a069f`。最终源码输入 SHA-256：`0818145c2f31dc49b58cba93ba30711747e82c405cdb6bc0923b14bc92457ab9`。

独立复核发现：先取消导出，再成功导出后，禁用保存按钮/文件对话框使 activeElement 落到 BODY；预览只在 section 上监听 keydown，因此 Escape 没有关闭预览。本目录 `before/diagnostic.json`、快照、PNG 与 `before.log` 保留开发侧在旧最终源码 `ffa7cdaff8e2694db35f4199063284307d15fbf6f803d13c442a173931118ad4` 的单项复现：BODY、inside=false、previewCount=1、exports=1、documentUnchanged=true，进程自然退出 1。它是明确失败记录，不因后续修复改记为通过。独审原始 attempt02 仍保存在独审目录。

修复将原 Escape / Tab 处理迁移到 ImagePreview 生命周期内的 document capture 监听器，仅在 live、root 已连接、未 hidden、有布局且 visibility 可见时处理。Escape 关闭并停止传播；Tab 从丢失的 body 焦点返回预览，边缘焦点在预览内部环回。卸载时移除监听器。没有修改原始文件导出、保存、防重复或授权链，也不在异步导出完成后强抢焦点。

验证结果：

| 命令/场景 | 结果 | 原始材料 |
| --- | --- | --- |
| `pnpm exec tsc --noEmit` | 自然退出 0 | `typecheck.log` |
| image-preview 桌面组 | 27 项，自然退出 0 | `desktop/summary.json`、`desktop.log` |
| image-preview 手机浏览器组 | 25 项，自然退出 0 | `mobile/summary.json`、`mobile.log` |

双端最终运行的输入 SHA 与上述冻结源码一致，sourceInputsChanged=false；运行在提交前完成，sourceHead 为前一证据提交且 gitDirty=true，不能将其称为提交后 clean 运行。独立复核随后对冻结提交精准复验，最终生产构建与完整组由根主线完成；未重复无改动的 storage/data79/controller/native 组，dist 没有重建。

新增六项回归对取消、成功、错误各执行两次真实预览保存按钮交互，只 mock picker/output 边界。第一遍保持保存完成后的自然焦点，立即发送 Escape，验证关闭、恢复原图触发器焦点、正文不变和正确导出结果。成功与错误两种情况实际观察到 BODY，修复后均关闭成功；取消情况当前浏览器保留 BUTTON 焦点，同样通过。第二遍记录自然焦点后显式 blur 到 body，发送 Tab、Shift+Tab，验证先到图片信息，再环回关闭按钮。双端 `image-keyboard-results.json` 保留每次结果与焦点，不把显式 blur 当作自然失焦。

新增第七项使用真实生产 ImagePreview 组件，依次隐藏、断开 DOM、dispose source、unmount，确认这些状态下 document Escape/Tab 不会被过期预览消费；已有 source dispose 同步隐藏保护图片字节与单次关闭验证保留。原 image-preview 的其他断言继续执行，因此合计桌面 27、手机 25 项。

本轮使用独立浏览器数据和模拟系统边界。没有操作已安装用户应用、真实麦克风、Android 设备或其未保存录音。
