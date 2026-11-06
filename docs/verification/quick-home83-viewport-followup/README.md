# 83 组合回归后续：手机测试组入口视口隔离

2026-11-06。主线恢复组合的 mobile attachments 在 storage-overview 原焦点断言通过后，进入 preferences 时等待 `.mobile-home-settings` 超时。本轮仅修两处 runner 入口条件，**产品 src 和 index.html 均未修改**。

修复冻结 `ec52b69eb5bc636b84704bdc31f1eb250eb3a51d`，前基线 `38f6bf75`。相对前基线仅 `scripts/debug/preferences.mjs` 增加 4 行、`scripts/debug/quick-home.mjs` 增加 2 行；原业务断言与场景保留。没有更改全局 `runtime.reset()` 的语义，也没有重跑完整 attachments 或无关 desktop / notes / recording。

## 原失败和确定性复现

原失败位于 `/private/tmp/notes-mobile-home8283-resume-uqzir_r8/mobile-attachments/`，其中 `failure.json`、`suite.json`、`failure.snapshot.json` 和 `failure.png` 按原字节保存在 [original-failure](original-failure/)。前序 storage 矩阵最后停在 1280px，reset 只重建 backend / reload，不恢复 viewport。`runtime.mobile=true` 是启动声明，不代表此时 App 实际还处在手机断点。

未修的 `38f6bf75` 上执行 [diagnose.mjs](diagnose.mjs)：真实 `page.setViewportSize(1280×844) → runtime.reset()`，得到以下实际状态，见 [baseline-pollution.json](baseline-pollution.json) 和 [HTML](baseline-pollution.snapshot.json)：

| 字段 | 声明值 | 实际值 |
| --- | --- | --- |
| 手机模式 | `runtime.mobile=true` | App 无 `.mobile`，为 desktop |
| 视口 | `runtime.viewport=390×844` | `innerWidth=1280`、`innerHeight=844` |
| 手机设置齿轮 | 手机入口应可见 | `.mobile-home-settings` 数量 0 |
| 冷启导航 | all 画廊、无编辑器 | default / folders、恢复 note-a |

因此 preferences 按声明走手机齿轮入口，但实际布局为 desktop。quick-home 同样依赖手机冷启，若沿用该污染会在首个冷启断言失败。诊断自然 exit 0 / 完整 wall 6.32s 表示成功保全复现状态，不代表旧组通过。

## 最小修复

`runPreferences` 仅在 `runtime.mobile` 分支，`runQuickHome` 在既有 mobile-only 校验之后，执行：

```js
await page.setViewportSize(runtime.viewport);
await runtime.reset();
```

先恢复声明手机尺寸，再 reset，确保 App 的首次初始化在正确断点完成。没有仅 resize 已启动 desktop 页面来冒充手机冷启，也不全局改变 reset 以影响组内有意保留的尺寸矩阵。desktop preferences 入口行为不变；quick-home 的 desktop 排除和 attachments 链末单次调用不变。

## 精确冻结验证

使用 [verify.mjs](verify.mjs) 直接调用这两个真实 run 函数。每组独立先切到 1280×844、执行真实 reset，断言确实是 desktop，再调用修复后的真实入口；只记录且转调真实 `runtime.reset`，捕获第一次入口 reset 之后的真实 DOM / App state。没有把测试入口调用改成 mock。

两组入口都实际恢复为 390×844、App `.mobile`、一个设置齿轮、`page=notes`、`folderId=all`、`noteId=null`。随后完整执行该两函数原有业务断言，包含设置保存/备份/焦点与新建单飞/精确聚焦/保存/来源/媒体；没有只单独在干净手机环境跑 preferences。

| 命令 | 结果 | 完整外层 wall |
| --- | --- | ---: |
| `/usr/bin/time -p node docs/verification/quick-home83-viewport-followup/verify.mjs` | 自然 exit 0，100 项，`pageErrors=[]` | 48.88s |
| `/usr/bin/time -p pnpm exec tsc -b --pretty false` | 自然 exit 0 | 2.62s |
| `git diff --check` | exit 0 | 未单独计时 |

完整输出：[verify.log](verify.log)、[typecheck.log](typecheck.log)。[frozen/summary.json](frozen/summary.json) 记录精确 commit、所有 100 项断言、两组真实污染/恢复状态、78 个 tracked src 文件 SHA-256、前后输入指纹和页面异常。100 项由 preferences 原 49 项、quick-home 原 44 项及 7 项污染前置/恢复/页面与源码检查组成；组内计时 preferences 8.128s、quick-home 12.681s，均不冒充外层含 runtime 启动/清理的完整 wall。

检查运行在冻结 `ec52b69e`，126 输入前后同为 `1a7374f011f8d8e89134b6068e4b8e21615a8ea12d2b437999ba7f20fbef4e94`，`gitDirty=false`。78 个产品 src 与 `d73e1f30` 逐文件字节 SHA-256 全相同，index.html 无 diff。

## 移交与限制

产品、index.html 无本轮改动，未生成 dist，拥有的诊断/验证/tsc/browser 进程已自然退出。仅提交本轮作者目录；独审准备目录不由作者 stage。源码、index 与 dist 控制权交回，供独立入口反例复核；根随后重新执行受影响完整 mobile attachments，其他已通过结果按其准确身份复用。

未操作原 Android 未保存录音、已装应用、真实麦克风或设备。上述真实 App / DOM 操作处于现有合成浏览器与 fixture 边界，不代表真实 IME / provider / 原版整窗像素通过。
