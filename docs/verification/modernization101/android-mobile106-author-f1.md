# Android稳定移动交互身份106：作者记录

基线：隔离snapshot `7fd7b282`，root来源406个文件SHA见 `artifacts/root-baseline106.json`。仅改隔离树，root冻结105源未改；产品/检查精确SHA见 `artifacts/android-mobile106/source-diff.json`，406项中无非预期变化，EditorSession控制器未改。

## 改动

`src/platform/layout.ts`固定现有Tauri native布尔值、Android UA和separate条件。原生Android普通主窗口保持移动交互，Mac/Web保留699/700断点与separate原排除。App初始mobile（含导航/恢复）与resize共用同一个稳定resolver，可用宽高仍正常更新。真实owner/授权/导航/实例失效规则保留。

视觉检查发现单改状态不足：原style.css手机布局/format样式仍被max699闸住。四个手机块改为以`.mobile`身份作用；其中原未作用域选择器（包括`:root`及dark规则）逐条限定mobile。原共享窄窗声明另留原max699条件，保持窄桌面/独立窗口既有表现，未将root或共享样式直接泄漏到宽桌面。没有美化、修改内容或放宽门禁。

## 因果与验证

- **before：** 正确依赖下真实App360→740，同note-a、真实非空PM选区1..6；mobile变desktop，format变none、formatOwner清空、generation4→6、lastClose=navigation，0pageerror。见 `artifacts/android-mobile106/before/width-transition.json`、`width740.png`、`result.json`。这证明特定尺寸/身份漏洞，不证明原102长按现场由旋转导致。
- 最初两次启动分别因稀疏树缺插件guest-js/public启动文件而在App加载前退出，**均非产品失败证据**。原失败日志/JSON保留；仅用root未改生产文件只读symlink补齐，精确依赖SHA见dependency-links.json。setup路径不计产品提交。
- `node scripts/check-platform-layout106.mjs`：61个显式布局矩阵/大小写及转换检查通过；8个生产Session+真实PM书签边界通过。同Android几何保持格式与代次，真正note/editor/access/blocked/hidden/destroy失效；错误owner无法执行格式命令。
- 状态接线后的首次真实App26断言通过，但视觉发现宽屏CSS不等价；保留在 `artifacts/android-mobile106/state-only/`，不能作为布局通过。
- CSS修正后 `node scripts/check-android-mobile106.mjs --baseline-css /private/tmp/android106-original-style.css`：48个实际App断言通过。原CSS来自`git show 7fd7b282:src/style.css`；独立复验可先将该内容写到临时路径再传同参数。
- 360→740→1024→360→740高度变化→500分屏→360短屏，每站核同DOM/EditorView/registered owner、非空PM选区、generation、格式可见；几何变化不产生文档事务或新增模拟IME意图。选中alpha准确加粗，完整循环后重新选beta准确斜体。横屏740/1024仅editor可见，format全宽贴底、正文滚动区止于面板上缘；关闭后底栏全宽贴底、7个按钮44×44。740格式和740/1024底栏已实际查看PNG。见after/geometry.json、resize-stations.json、bottom-controls.json和截图。
- 有效未锁定持久selectedNote=note-a/default，在740冷启动仍走mobile all/null列表恢复、无旧pendingFocus；真实换笔记、模态blocked、锁定撤权仍清面板/旧焦点。Mac/Web699/700与separate规则保持；同宽替换回原CSS后geometry完全相同（Mac/Web740，separate699/740）。
- `git diff --check`通过。全部自有node/Chrome/Vite已自然退出，无原生构建、ADB操作或全suite重跑。产物约208KiB级，无字体/大fixture复制。

这里的App是真实React/PM/布局和产品控制器；native身份、IPC持久层、系统IME边界受控模拟，不是Android实体旋转或系统键盘证明。最终非诊断同源安装包仍须真机旋转/IME验收；**原FORMAT102长按失败仍开放**。

## F1独审窄修（基于e8b08eaa）

首轮独审拒绝95b287cb：给原shared选择器添加`.mobile`提高specificity，恢复了旧更多/撤销/重做图标圆框，证据与拒绝报告保留未覆盖。修正只将**原36处新增身份前缀**改为零特异性的`:where(.mobile)`，与7fd7b282原四个max699块逐条对应；原本已有`.mobile`的规则与`:root`→`.mobile`不改。声明值、数量和规则数量完全未变，不触Controller或其他产品。

复用独审app-probe，仅输出到新after-f1目录：真实App1024→700→699→1024的owner/EditorView/selection/generation/底部几何通过；tiny与huge、120%图标/命中区的全部捕获computed属性逐项等于旧CSS，更多SVG padding/radius恢复0px/0px。原probe最后硬编码宽屏dark=rgb37失败，完整保留after-f1-run.log；这个预期来自首轮新增scope提高优先级的副作用，不应通过恢复该副作用“修”测试。

另用scope-f1-probe作最小直接对照：原CSS窄屏dark、新CSS窄屏dark、新CSS740宽屏dark均为`rgba(45, 45, 47, 0.96)`，原`.dark .mobile .popover`的优先级保持。宽740仍仅editor可见、format全宽贴底/正文不遮挡、真实非空选区/owner保持，0pageerror，5项通过。未重跑完整48/61组或原生构建/设备。

F1新增证据位于`artifacts/android-mobile106-independent/after-f1/`，具体工具为同级app-probe-f1.mjs与scope-f1-probe.mjs；精确CSS前后SHA/逐规则变化在source-diff.json，原失败font-tiny及报告均未覆盖。git diff --check通过，所有自有测试自然退出。等待同一不同作者reviewer复核；原102及最终原生验收边界不变。
