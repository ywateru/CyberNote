# 73 视觉脚本效率窄复审：PASS

2026-11-06。受审脚本提交 `565b8a154b16f28727f6ba83e6510d311c8f7aea`，独立 review merge HEAD `883414ee530d7d1f12b20cd782d374355ea1ed76`。本次只审 optimizeDeps 配置及其 summary 记录，独立重跑完整视觉矩阵；此前 [df3 完整复验](app-mobile-recording-primary73-recheck.md) 的100/43/9、build和production结果及259.887s历史保持不变。

差异只有 `scripts/check-mobile-recording-primary73.mjs` 新增12行：Vite依赖入口显式为 `src/RecordingView.tsx`，include显式加入虚拟JSX bootstrap使用的 `react-dom/client`，summary记录同一配置/理由。未修改fixture状态、断言、矩阵、旧CSS注入、动作处理、图像管线或产品。独立核对本地 Vite6.4.5 `computeEntries`：显式 entries 走对应 glob；无 entries/build input 时走 `**/*.html`，与避免历史HTML发现的目的相符。没有据此推断应用运行性能。

独立外层 Python subprocess 从 UTC 2026-11-05T17:21:45.075728 到17:22:34.678355，**自然 exit0，wall49.602s**。同机本独审旧配置 wall259.887s，约5.239倍、耗时减少80.914%；这是两次实测而非跨机器基准或稳定分位数。此次没有超时重启/终止。source start/end七输入指纹均 `105edc90f2f4f8b64010ed36f6372430a8f9958b48eead929106d63332ce9f78`，独立重算相同，summary PASS、errors=[]。

App CLI的78输入独立重算仍为 `62cf6dae5bdd04d08c3aa67756950c0cfad068a04752f7f39dd98f2fceb03c44`；对df3e5c42该输入集无文件差异。因此按根给定窄范围不重跑无变化的App组，既有全套证据继续适用；不把新脚本7输入指纹误称App78指纹。

视觉仍覆盖每个 before/after 的18手机组合（三尺寸×浅深×三态）及6桌面组合。真实tap/Enter/Space/disabled、≥44px命中、完整视口与全部几何前后一致均由原断言通过。独立六桌面Pillow/JSON复核：前后RGBA不同像素0、最大channel delta0、PNG字节、HTML与所有computed属性相同。

另对565结果与上一轮df3独审做交叉验证：**69个PNG/DOM文件逐字节相同**；12个桌面computed JSON的全部结构和值逐项相同。跨运行computed序列化hash变化，因此不宣称它们跨运行字节相同；同次运行before/after严格computed哈希相同，未放宽正式断言。除computed序列化hash外，两个正式summary的全部variant布局、像素/ROI/mask指标与checks精确相同。

独立Chrome统一sRGB全帧784×1680→224×480，再Python重算新图的ROI/contour，结果与df3重算完整JSON精确相同：button MAE idle31.538027→26.035651，recording15.923816→10.185226，paused37.330899→10.999026；paused core36.664021→2.664021。两阈值IoU/XOR等全部数值亦相同。原raw/browser色管区分、idle核心和recording glyph未改善、paused glyph残差19.870445等限制继续沿用，没有把本次提速扩张为整体像素PASS。

无blocking finding，允许合入此脚本配置。无设备/模拟器/原生应用/麦克风/用户音频操作。证据：[efficiency-recheck](../../verification/mobile-recording-primary73-independent/efficiency-recheck/README.md)，含新自然退出计时、正式summary、独立交叉证明、全样本压缩包及重算脚本。旧blocked及首次143历史、旧df3通过与长wall事实未覆盖。
