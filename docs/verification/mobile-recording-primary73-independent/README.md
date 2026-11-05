# 73 首轮独审证据（2026-11-06）

受审0843c54f16ed92ff33535bbe4fa89247e148ab18，baseline3534acaf，78输入SHA091afbbd7df88f5da1f8f0b92d54ba7fb99101cc4aaed62c7c82d66629bfad1f，各CLI start/end一致、gitDirtyfalse。结论[blocked](../../plan/reviews/app-mobile-recording-primary73.md)。只读产品，未改runner/产品源码。

| 运行 | 真实结果 |
| --- | --- |
| desktop九组 | summary100检查PASS、35.976s；cleanup未结束后SIGTERM，最终exit143，**非exit0** |
| mobile recording | 22检查后重开卡range入口UNAVAILABLE，exit1，13.636s |
| mobile notes | 9PASS、exit0、11.119s |
| pnpm build | exit0，Vite4.60s（总时未采） |
| fresh dist check-production | API缺失/URL不可启用/marker0，exit0、1.245s |
| visual脚本 | 完成mobile样本及after首个desktop，未最终summary；own PID66856有界清理后exit143 |
| remount独立probe | 自然exit0，明确复现src空→blob令已展开range消失，后续fill UNAVAILABLE |
| standalone Chrome颜色probe | 自然exit0，保存三个original及before/after全帧缩放PNG |

[remount-proof.json](remount-proof.json)与[source](remount-probe.mjs.txt)给出最小因果：read延迟600ms，B→A后title1/src空，展开后input1，750ms后src blob/input0，dom.fill返回UNAVAILABLE。这里750ms是诊断观察窗口，绝不是建议runner使用固定sleep。应等待明确同卡媒体ready后再点title并验实际后段播放。

[owned-termination](owned-termination.json)只含本人两个PID66856/66895的SIGTERM记录；tools后续确认两session exit143。此前ps在2分以上仍显示存活/CPU0/esbuild子进程；development另一次自然完成不能追认本轮。原始完整输出保留/private/tmp/primary73-independent-*。没有kill任何其他agent进程。

[partial-visual-quant](partial-visual-quant.json)是独立Python/Pillow重算，输入为真实共享View在392×840/DPR2产生的完整784×1680图，经独立Chrome sRGB canvas高质量drawImage等比缩至224×480。固定ROI和2.5px外轮廓带、阈值210/235，算法参数在JSON；partial-visual下保存浏览器管线原图与old/new。原rawPNG均有cICP01010001/cHRM/gAMA；Pillow raw不应用Chrome颜色转换，paused raw255/190/187、browser255/186/183，不能混算。只有局部改善结论，glyph/抗锯齿残差保留。

[partial-desktop](partial-desktop.json)核首个desktop idle/light全图差0/HTML/computed一致，不代表六态。完整touch/keyboard矩阵及desktop六态最终脚本未结束，留待修复后重跑。

边界：headless Chrome、受控合法View props/动作sink与真实App合成媒体/isolated JS protocol fixture，没有Android/原生应用/麦克风/用户音频、Rust或原生构建。所有PNG都为测试界面，不是原版像素通过。
