---
id: app-mobile-home8283
scope: preferences82-and-android-quick-home83-integrated-delivery
status: pending
depends-on: [app-preferences82, app-android-quick-home83]
---

# objective

82统一设置/数据与83手机快速画廊串行开发/独审合入后，以同一冻结源码一次完成主线回归、准确Mac26/Android16构建与独立核包，交付可本地安装的包及清楚验收边界。

# context

docs/ui/preferences.md、docs/ui/android-quick-home.md、docs/testing.md、docs/debugging.md、docs/verification/ui-hierarchy8081/README.md。

# path

根维护主线合并/文档/临时整合驱动，记录docs/verification/mobile-home8283/，准确包放artifacts/mobile-home8283/。源码独审和核包由不同于开发的agent执行。源码与docs入git，大产物/提取物不入git。

# verification

冻结源码标识和sourceFingerprint前后相同；pnpm build（真实tsc -b）、production排除、桌面all、手机notes/recording/attachments六项自然退出0；attachments包含preferences与quick-home，若不含则明确补单组。Mac和Android串行build，复用主依赖和target，不清共享缓存；逐包记录完整输入before/after、准确frontend、签名、实际内嵌资源及归档等核验。旧Mac原签名失败原件保留、派生adhoc严格通过；APK debug签名，不安装原设备。布局截图来自合成fixture并明确不是原版整窗像素；未测试真机IME/系统chooser/硬件录音不冒认。回归失败须修复后只重跑受影响边界再恢复组合，不覆盖原始失败。

正常清理本轮已合入且clean的worktree/分支；不动历史worktree/主node_modules/target/用户数据或原Android未保存录音现场。最终中文回复包含Android主要行为、82保留交付、截图/包/验证报告绝对路径。
