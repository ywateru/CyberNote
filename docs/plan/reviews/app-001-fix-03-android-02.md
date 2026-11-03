---
id: app-001-fix-03-android-02
task: app-001-fix-03
baseline: 20c3014
result: secure-id-static-and-finite-checks-pass-native-retest-pending
date: 2026-11-03
---

# FIX03 Android 安全 ID 兼容有限补审 02

**20c3014 的统一安全 UUID 兼容实现通过静态与有限脚本检查。** Android 真实输入保存及锁定/冷启动尚待新默认 APK 交接；这里不提前关闭补审01的实际运行 P1。

`secureId` 优先调用当前 `globalThis.crypto.randomUUID()`。旧 WebView 没有该方法时，使用同一平台对象的 `getRandomValues(new Uint8Array(16))`，第6字节保留低4位并置version=4、第8字节保留低6位并置RFC4122 variant；按8-4-4-4-12小写十六进制格式返回。没有 `Math.random` 等弱随机回退。安全源缺失明确抛错，不伪造保存登记。

生产 `src/bridge.ts` 的保存intent、浏览器预览新note/newFolder/attachment ID和 `src/proof-access.ts` 的request ID均复用该函数；`src`内仅实现本身仍读取 `randomUUID`，没有遗漏的直接调用。Rust未变，本轮没有重复无关后端矩阵。

独立运行与证据 `docs/verification/qa-fix-03/run-20c3014/`：

| 检查 | 结果/边界 |
| --- | --- |
| 5个涉及代码/脚本/配置文件的运行前后身份 | 均逐字节匹配20c3014且运行间未变化 |
| `pnpm test:secure-id` | pass；原生优先路径、0/255位边界、真实平台CSPRNG回退128个UUID格式及本次无重复、缺API/缺crypto拒绝 |
| `pnpm exec tsc --noEmit` | pass |
| 安装产物及实际WebView91编辑保存 | pending，不由Node平台CSPRNG检查替代 |

有限样本没有证明碰撞概率或移动端运行；强随机性的依据是平台密码学随机API及正确位处理。后续实际WebView仍不改写全局crypto，不注入编辑器状态，只通过真实输入和保存后重启验证。
