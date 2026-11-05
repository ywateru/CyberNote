# 录音独立窗口54：准确双端构建准备

主线固定源5a147d2，50最终20文件与12e5独审源相同；52最终13文件与f5bc101相同，六项整合检查通过。产品/输入按两个明确授权JSON逐项列明，保留各平台上一轮完整输入并加入本轮新增文件、所有tracked产品与插件资源。Mac15与Android09按同一固定主线依次冻结、构建、收集；共享target/Gradle缓存期间不安排其他操作者。

执行既有preparation工具：freeze后核精确input-freeze.json SHA，run显式传此SHA及exclusive-target-and-cache；Android另带allow-scoped-gradle-offline-init。成功后立即collect，再构建下一平台。旧输出按runner原子保全，不删除原包、数据、缓存、证据或worktree。构建通过与真实运行/音频/像素分开；设备按recording-window54-runtime-plan.md继续。
