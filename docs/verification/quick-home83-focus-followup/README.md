# 83 组合回归后续：数据管理返回焦点测试时序

2026-11-06。主线组合六项的前五项通过，第六项手机 attachments 链在 `storage-overview.mjs` 的 `Focus trap wraps forward Tab back to header` 停止。本轮只修测试导航完成条件，**没有修改产品源码或放宽 Tab 断言**。

修复冻结：`1ad73a08b52c4b38ec4693872eeda13eba3d6437`，前基线 `11f0ee7a`。相对基线只在 `scripts/debug/storage-overview.mjs` 增加 8 行；相对产品冻结 `d73e1f30` 的 `src` 与 `index.html` diff 为空。78 个 tracked src 文件均以真实字节 SHA-256 与 d73 逐文件核对一致，记录在 [frozen-storage/summary.json](frozen-storage/summary.json) 的 `productFiles`。

## 原始失败与自然复现

根的失败路径是 `/private/tmp/notes-mobile-home8283-root-8dercvx0/mobile-attachments/`。其 `failure.json`、`suite.json`、`failure.snapshot.json` 和 `failure.png` 按原字节复制到 [original-failure](original-failure/)，未改写主线原件。根另将完整尝试保存在主线 `docs/verification/mobile-home8283/integration/attempt01/`。

原失败截图焦点落在 `data-storage-category="all"` 的“查看全部文件”，原反向 Tab 断言已过，前向 Tab 断言失败，`pageErrors=[]`。当时 126 输入前后指纹相同：`c4fcc377e3ac0b1bac640e4a29fdc3039cf3e558dff3491ef43f1981611cdfd1`。

在未修 runner 的 11f0ee7a 树上执行 [diagnose.mjs](diagnose.mjs)，保持真实 App / Preferences / DataManagement，通过只记录、不改变行为的 `HTMLElement.prototype.focus` 包装采集调用栈。没有延迟、替换或排队 requestAnimationFrame，没有修改产品 DOM 或用 mock 代替 Tab 行为。

[natural-focus-trace.json](natural-focus-trace.json) 保存连续五轮的原始焦点和 focus 调用栈。第二轮自然出现反向 Tab 结束在 `data-storage-category="other"`、前向 Tab 结束在 `data-storage-category="all"`；其他四轮正常。对应返回分类的 focus 调用栈指向真实 `src/DataManagement.tsx` 的 `back()` rAF 回调（开发服务器转换后的行 267），并非 Preferences 的首尾 focus trap 分支。该诊断脚本自然 exit 0 / 完整 wall 6.51s 表示成功收集原件，**不表示五轮行为全部通过**。

原因：DataManagement 返回总览时先切换 view，再在下一帧聚焦原分类。旧 runner 的 back helper 只等 `.storage-summary` 出现，紧接着测试 `close.focus → Shift+Tab → Tab`；既定的返回分类 focus 可以在这一序列中迟到，干扰正在测量的首尾 Tab。原子导航尚未完成，不能把这条时序当作已稳定的 focus trap 行为。

## 最小修复

back helper 在点击前读取真实 `data-storage-view`，返回总览后使用有界 `page.waitForFunction` 等待 `document.activeElement` 的 `data-storage-category` 等于该来源，再执行后续动作。这比等待 DOM 出现更严格，也验证了现有真实返回焦点行为。

原反向和前向 Tab 断言逐字保留；不增加 sleep，不重复全量重跑，不人为设置“返回已完成”状态，不修改产品 rAF / focus trap。来源分类不存在或真实焦点没有归还时，等待会超时报错。

## 冻结验证

| 命令 | 结果 | 完整外层 wall |
| --- | --- | ---: |
| `/usr/bin/time -p node docs/verification/quick-home83-focus-followup/verify.mjs` | 自然 exit 0；直接运行 `runStorageOverview` 原 68 项，加 pageErrors / 逐 src 文件 / 前后输入一致，共 71 项 | 15.85s |
| `/usr/bin/time -p pnpm exec tsc -b --pretty false` | 自然 exit 0 | 2.60s |
| `git diff --check` | exit 0 | 未单独计时 |

完整原始输出在 [verify.log](verify.log)、[typecheck.log](typecheck.log)；[verify.mjs](verify.mjs) 只直接调用受影响的 `runStorageOverview`，没有运行完整 attachments、storage backup/navigation 扩展或 desktop all。应用处理器、键盘事件及数据页面均为真实组件，保存/库存/媒体为该现有专项的显式 fixture。原两条 Tab 断言均通过，包含完整 320/390/800/1280 浅深布局及此前数据业务断言，`pageErrors=[]`。

检查精确运行在冻结 `1ad73a08`。126 输入在验证前后同为 `c04c48d484961b22efa6828ca27e5b4fc183ee5d00b0a8a36c5ba4528aa5029b`，`gitDirty=false`；该新指纹仅来自 runner 的 8 行修改，78 个产品 src 文件未变。组内 elapsed 10.183s 不含 runtime 启动及最终清理，完整 wall 使用外层 15.85s。

## 移交及限制

本树产品源码、index.html 均无新改动，未生成 dist（目录不存在），无临时入口。拥有的诊断、验证、tsc 与浏览器进程已自然退出；交回 index/dist 控制权供独立最小复核。根随后只需按其整合计划重跑受影响 desktop storage-overview 与完整 mobile attachments，并准确记账原五项业务结果；作者不代替独审或组合通过。

没有操作已安装应用、原 Android 未保存录音、真实设备或麦克风。受控浏览器 focus 验证不替代 OS 焦点/真机 IME 或原版整窗像素验收。
