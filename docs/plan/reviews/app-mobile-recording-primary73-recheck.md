# 73 修复后独审：PASS（限定源码与浏览器范围）

2026-11-06。独立验收树 `codex/mobile-recording-primary73-review`，受审 HEAD `818d51d69f4f4cf52daac55b0855e37fe11fc181`，产品与 runner 输入与开发修复提交 `df3e5c42` 相同。原始产品提交 `0843c54f`，视觉 baseline `3534acaf1475c241895191d93ec839a5428cfc97`。正式运行开始时工作树 clean；期间没有产品或 runner 修改。

本次没有 blocking finding。此前 P2 媒体就绪竞态已关闭：runner 对 B→A 重挂载注入 600ms read 延迟，用有界的同步 `waitForFunction` 等唯一真实音频卡的非空 blob src/currentSrc、HAVE_METADATA 和有效时长，再单次点击标题、实际填写 range 并播放。实测等待 737.826ms、readyState=4、时长 5.220708s；真实后段播放状态达到 4.210282s。没有用固定 sleep、重复点击或产品寿命改动掩盖失败。

原始 [blocked 报告](app-mobile-recording-primary73.md) 和原始证据完整保留。其手机首次 22 项后 exit1，以及两个 own process 按当时根指令清理后的 exit143，均不回写为成功；本轮以下六项是独立的新运行，全部自然退出 0。初轮两分钟以上存活本身不足以证明永久泄漏或产品缺陷。

| 本轮正式检查 | 结果 | 外部进程 wall 秒 | CLI 秒 |
|---|---|---:|---:|
| TypeScript / Vite build | PASS，Vite 阶段 1.44s | 3.418 | — |
| 桌面九组 | 100 PASS | 31.211 | 30.387 |
| 手机 recording | 43 PASS，包含新增 remount readiness | 19.695 | 19.366 |
| 手机 notes | 9 PASS | 7.198 | 6.902 |
| 生产入口排除 | API 不存在、URL 不能启用、bundle markers 无匹配 | 3.422 | 3.086 |
| 共享 View 视觉矩阵 | PASS，自然 exit0 | 259.887 | — |

由独立 Python subprocess wrapper 记录 UTC 起止、外部 wall 与退出码，不只看 suite summary。正式 runner 并发最多 3。视觉运行用时 259.887s，仍是验收效率残差；此结果没有将长耗时解释为本任务的应用运行性能问题。build 只有既有 >500kB chunk 提示，未影响退出。

正式 App CLI 的 78 输入 SHA-256 为 `62cf6dae5bdd04d08c3aa67756950c0cfad068a04752f7f39dd98f2fceb03c44`；每组 start/end 一致，gitDirty=false、sourceInputsChanged=false、pageErrors=[]。视觉 7 输入指纹 `c9160c6d116599656514c35b69bf2f1faae6e617d1c713276cb65cc8fe211600`，独立重算与 start/end 完全一致。RecordingView 在 baseline 与当前的 SHA 都为 `e18f205e9d49c96abc1c590ffd8757a10e60d9060459f04400c24bdec07d094e`。产品仅新增 17 行 mobile 限定 CSS，无 Session、音频编码、Rust、SQLite 或标题改动。

真实共享 RecordingView 在合法受控 props 下生成样本，覆盖 idle/recording/paused × 392×840、320×568、280×600 × 浅深色，每个 variant 18 组。全部 primary ≥44×44 CSS px、在视口内、elementFromPoint 命中；实际触屏、Enter/Space 调用 handler，禁用触屏不调用。全部元素几何前后相同。暂停内芯使用跟随主题的纸色间隔，深色未硬编码白间隔。该 fixture 只证明 View 和 action sink，不冒充媒体采集。

桌面 280×467 浅深色三态六组，原脚本逐元素 rect、全部 computed、HTML 与 PNG RGBA 严格 0 差。另用独立 Pillow/字节/JSON 比较复核六组：不同像素=0、最大 channel delta=0、PNG 字节完全相同、HTML 和全部 computed 相同，无 mask 或容差。完整原始 render 输入压缩保全，可解包复算。

独立 Chrome 统一 sRGB canvas 解码原图和正式完整 784×1680 截图，高质量全帧等比例 drawImage 到 224×480，再用独立 Python/Pillow 按固定 ROI、2.5px 胶囊环带、阈值 210/235 重算。结果与正式脚本逐项精确一致，没有裁图缩放、自比或 raw/browser 管线混用。

| 状态 | button MAE 前→后 | core MAE 前→后 | 中央 glyph MAE 前→后 |
|---|---|---|---|
| idle | 31.538027→26.035651 | 11.328125→11.328125 | 11.296896→11.296896 |
| recording | 15.923816→10.185226 | 0.333333→0.333333 | 55.327935→55.327935 |
| paused | 37.330899→10.999026 | 36.664021→2.664021 | 45.404858→19.870445 |

两阈值轮廓 IoU 分别为 idle .150943/.443439→.534314/.597786，recording .191067/.377532→.877451/.728261，paused .431034/.427553→.703349/.638604；XOR 分别 135/123→95/109、326/338→50/150、198/241→124/176，均改善。精确 ROI、公式、原图 SHA 与全部数值见独立脚本与 JSON。

原图 PNG 为 RGB 224×480，cICP=`01010001`、cHRM、gAMA45455，无 iCCP；原 n0960 的 raw 内芯 modal 为 255/190/187（250/252），统一 Chrome 解码后为 255/186/183，当前 clone 为 255/190/187。两管线分别记录，不能据 raw 数字相同宣称原生 token 一致。idle 红芯、recording glyph 没改善；paused glyph 仍有 19.870445 MAE。低分辨率、字体/抗锯齿、几何和原录屏压缩残差继续开放。

结论：允许合入当前限定的中央控件局部视觉改进及 runner readiness 修复。该 PASS 不代表原生设备、真实麦克风、Rust Store 或整体 Apple Notes 逐像素通过。本轮无设备/模拟器/原生 App/真实 mic/用户音频操作；原 Android 保留现场未动。证据：[recheck README](../../verification/mobile-recording-primary73-independent/recheck/README.md)。
