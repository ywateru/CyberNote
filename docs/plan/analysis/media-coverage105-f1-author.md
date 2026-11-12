# MEDIA105 F1 作者窄修交付

2026-11-10，等待原独审复核。仅修`coverage105.mjs`清理边界及`check-coverage105.mjs`的故障回归；没有扩展正式流程、构建、浏览器/设备操作或作者smoke。

修前用冻结SHA `d5ef48f…` 的精确record和finally前缀复现原3case：wall-limit、append ENOSPC、last-viewport ENOSPC均跳过全部资源close。原始结果保留在`artifacts/media105-f1-author/before.json`。

修后finally观测与证据写分别受保护；nested finally逐项尝试context/browser/browserServer、每个socket、server connections/listener、backend。某项失败不会阻断余下关闭。保持record的45min检查，不将最终观测绕过门槛；失败追加原failures并尽力写stderr。资源清理后各证据与最终result也分别best-effort，写result失败仍会保stderr且exit1；不将失败变成功。

同一源抽取的原3case修后全部尝试清理。另`node scripts/performance/check-coverage105.mjs --cleanup only --output artifacts/media105-f1-author/regression.json`执行实际完整finally控制流：14组故障覆盖原3、snapshot、context/browser/browserServer/socket/serverConnections/server/backend各项失败、全部证据写失败、configuration/result写失败。每组均尝试全部owned资源（包括首socket失败后的第二socket），保留原失败、尝试result、记录stderr且exit1。使用受控资源/IO doubles，无原生或浏览器进程；不能替代独审尚未执行的唯一真实代表smoke。

[精确SHA与受控结果](media-coverage105-f1-author.json)。窄补丁`artifacts/media105-f1-author/f1-only.patch`；原冻结全工具patch/before副本/历史raw未覆盖。当前root既有accepted dirty未提交，未操作index。工具现再次冻结，实际代表运行留给design独审。
