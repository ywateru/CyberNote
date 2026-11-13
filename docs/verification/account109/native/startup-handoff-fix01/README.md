# ACCOUNT109 startup handoff：有限实现验证

2026-11-13。基线 `816041b387024d9aa620abb4c50affae6ddffb6f`；待独审源码 commit **`1abadb7bac9f08893ba371b2969abe5639b45b99`**。隔离分支 `codex/account109-startup-handoff-fix`。仅改 `src/App.tsx`、`src/startup.ts` 和对应设备外 fixture；本目录是单独的验证归档。

## 实现与边界

`startupReady` 原表达式与基线逐字相同。调度生命周期改用 layout effect，只在已提交的 gate 为真后竞争双 rAF 与固定 250ms timer；false/unmount 的取消在 commit 同步执行。完成与取消均先失效当前 owner，清理另一分支；代际和 live/once 检查拒绝被取消后仍迟到的回调。timer 仅终止装饰性 paint wait，沿用现有 splash fade/ARIA 解除逻辑，不证明 paint 或 Native Ready。

独立的每次 commit layout effect 发布九个 boolean gate；诊断更新不会重启 250ms 预算。仅 `DEV && VITE_NOTES_DEBUG === "1"` 发布固定 schema=1、有限 phase 的 `window.__CYBERNOTE_STARTUP_DIAGNOSTIC__`。快照及 gates 冻结；调度器不读取诊断作为权限或就绪依据。普通构建不发布该全局字段。原 gate 的 TypeScript 推导含 number，故只在诊断投影使用 `!!startupReady`，不改 gate。

未改 quiet-cover、execute barrier、`debug/runtime.ts`、driver、`sync_e2e.rs` 或 public 文件。Feynman 的 debug idle/native 诊断增量及最终整合验证属于独立任务。

## 验证

- `node --check scripts/verification/account109-startup-handoff.test.mjs`：通过。
- `node --test scripts/verification/account109-startup-handoff.test.mjs`：**16/16 通过，零跳过**，见 [tests.txt](tests.txt)。
- `pnpm typecheck`：通过，见 [typecheck.txt](typecheck.txt)。
- `pnpm build`：通过，见 [frontend-build.txt](frontend-build.txt)。保留产物大于 500kB 的构建 warning；未因本次修复扩大构建范围。
- 扫描普通 production 构建的全部 2 个 JS 产物：诊断全局 marker 缺失。生成 dist 共约 1.4MB；复用既有依赖，没有安装或新增大缓存。精确输入 SHA 与检查结果见 [receipt.json](receipt.json)。

Fixture 执行实际 `startup.ts`、从实际 App 提取的 gate/两个 effect、完整既有 `public/startup.js`。最小 DOM host 上使用真实 React createRoot/flushSync/layout commit 与 StrictMode；可控 rAF/timer 能强制交付已取消的旧 callback。覆盖零/一/双帧、竞态两种顺序、false/unmount/重放、取消后的重新就绪、原 gate 正反例、错误和 reduced-motion、有限诊断与普通构建禁发。额外负向 fixture 将调度生命周期临时变为 passive effect，确认测试能观察旧 timer 在后续 layout callback 中错误 release，具有回归敏感性。

最初 fixture 启动因直接解析未声明的 esbuild 依赖失败，已改为使用现有 Vite 自带 compiler，未新增依赖。首次 typecheck 发现诊断 boolean 类型问题，原失败保留在 [typecheck-initial.txt](typecheck-initial.txt)，修正后最终检查通过。

这不是完整 App mount、WebKit 调度、GUI 或实机验收，不能证明 live01 当时所有 gate 已满足或此次修复解决其精确根因。250ms 与既有 fade timer 都仍受宿主 JS 调度影响。未运行 App/browser/native build/ADB/网络，未读取凭据、grant 或原库，未使用共享 Cargo target，未覆盖系统环境变量。
