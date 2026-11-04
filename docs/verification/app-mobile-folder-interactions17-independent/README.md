# Mobile17 independent evidence

2026-11-05 SOURCE REVIEW PASS / STOP。简明审查见 `docs/plan/reviews/app-mobile-folder-interactions17.md`。

- `protected-inputs.json`：37 个受保护源和作者证据，初末指纹相同。
- `minimal-source.diff`：独立按归档基线生成的三个产品文件差异，无 Git 操作。
- `command.json`、`attempt01.stdout.txt`、`attempt01.stderr.txt`：首次运行命令、耗时、exit 0；71 项全通过。
- `attempt01/result.json`、三张截图及 `production-folder-fragments.json`：实际组件检查；正常几何与归档前后精确相同。
- `result.json`：独立结论、原失败与限制；作者原始失败和夹具修订没有改写。
- `evidence-index.json`：本目录除自身和自有 vite-cache 外全部文件，加独立审查报告的 SHA256。缓存保留，不作为验收证据。

仅受控 Chromium 与内存回调；无完整 App/Editor/持久化、原生 Android 选择把手或 iPhone 像素结论。准确新包验收由 root 负责。浏览器和本机服务已关闭，无产品修改、平台构建、GUI、ADB、DB、下载、Git 或共享缓存操作。
