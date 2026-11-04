---
id: app-001-paper-rounded-selection03
scope: android-mobile-paper-selected-frame-curvature
status: in-progress
depends-on: [app-001-mobile-paper-order-02]
---

## 目标与依据

使手机纸张页金色选中框沿白卡片圆角。原录屏86秒plain与当前准确recovery02实机plain的同状态证据于 `verification/android-paper-plain-geometry03/`；作者先读原PNG与既有source，不能仅以源码猜测运行绘制。权威候选契约见 `ui/android.md` 手机纸张选框圆角候选03。

## 实施边界

仅src/style.css的`.mobile .modal-paper .paper-option.selected`及其伪元素。保持既有白卡片radius5px、宽高/位置/颜色/阴影、mask/卡片顺序；以pointer-events:none的绝对定位伪元素1.5px描边、inset -2px、外radius7px替代outline，外扩2px等于原outline厚1.5+offset0.5。若完整CSS存在冲突必须按真实computed/paint解决并说明，不另改统一按钮样式。禁止App/Editor/DOM/JS/schema/依赖/纸张持久化/桌面样式变化。

## 验证与交付

复用现有真实App、完整CSS和实际Editor渲染设施：旧新同状态相同viewports比较描边边界/角部，computed与实际raster相互验证；plain和其他六态、未选、短屏滚动、桌面分支，确保几何/命中与真实父key/Editor/View/DOM/全文保全，调用原选择与返回路径。不得新写仅镜像几个CSS常量的测试。pnpm build及必要受影响检查。保留旧直角raster和任何失败，不冒称新APK或像素通过。

作者不GUI/ADB/平台build、不触共享target/cache、不下载升级清理；输出前>=2GiB。仅本任务源码及自有证据，不stage/commit其他作者文件。源码由不同作者独审后root冻结准确commit，离线构建Android，新包保数据升级及同QA plain保存重开/恢复grid-large实际验收。root独占Mac GUI。原版radius/字体/DPR未知继续显式保留。

## 源码候选与独审03

CSS d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7已由不同作者SOURCE-READY，报告 `../reviews/app-001-paper-rounded-selection03.md`。真实App/完整CSS七态、短屏命中及桌面对照通过；独立Chrome旧新raster相同，不能据此称Android方角已修。原准确Android plain方角与原版录屏圆角证据另存 `verification/android-paper-plain-geometry03/`。首次选纸编辑器重建另由same-style03修复并独审。两项均仍待统一准确新APK、保数据升级及实际选择/返回/输入/重开。
