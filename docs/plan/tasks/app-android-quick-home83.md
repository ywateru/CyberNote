---
id: app-android-quick-home83
scope: android-direct-gallery-and-one-tap-create-editor
status: in-progress
depends-on: [app-preferences82]
---

# objective

按用户最新三图，手机默认直接进入简洁两列画廊，黄色＋一键真实新建并聚焦输入；目录/设置退到次级入口、编辑页面精简，保留保存/附件/录音能力。以docs/ui/android-quick-home.md为准。

# context

docs/INDEX.md、docs/ui/android-quick-home.md、docs/research/android-quick-home83/README.md、docs/ui/android.md、docs/ui/preferences.md、docs/ui/recording-mobile.md、docs/debugging.md、docs/testing.md。

# path

等待82冻结独审合入，根建新隔离worktree后交开发agent串行修改src/App.tsx/style.css/必要Editor接线、src/debug和scripts/debug手机runner；不改原生controller/媒体存储与录音控制逻辑。不同agent独审；根负责文档/合并/组合回归、Mac26/Android16准确出包。原设备现场完全不操作。

# verification

新增mobile quick-home组覆盖真实点击＋、单次创建收据/元数据/访问/真实editor focus/保存重载、失败/延迟/导航竞态、初始化/Back/搜索、锁定不泄漏、桌面偏好保持、设置和媒体入口，320/390/430/800短屏浅深布局。旧手机组保留保存断言。82+83最终一次主线完整回归/生产排除/准确构建/精简独立核包；真实AndroidIME及整窗像素另列，不冒认。
