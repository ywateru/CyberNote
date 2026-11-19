# 云存储设置组件

从 `index.ts` 导出 `CloudSyncSettings`、类型和默认 Tauri client。宿主插入 `Preferences.cloudSync`，传入 `active` 与 `CloudSyncPorts`，无需登录 CyberBus。使用 `.preferences-workspace` 下的公共 settings121 CSS primitives/tokens，组件 CSS 只负责内联表单和反馈布局。测试可注入严格类型 `CloudClient`，生产默认只 invoke `cloud_sync_command`。

协议、payload、原生命令注册、Host trait、Store/Session 适配和生命周期由 [后端模块契约](../../src-tauri/src/cloud_sync/README.md) 统一拥有。`types.ts` 是前端镜像，改变 DTO 时须同步两侧。

确认阶段与 context/client 阶段共用代次化单操作 owner：开始询问前认领，
原生确认异常被捕获为一个固定中文错误，拒绝/取消不调用同步。active 切换
立即废弃 UI owner，旧响应和 finally 不得覆盖新请求；已经发出的原生操作
仍是宿主的生命周期责任，不能把隐藏 UI 当作 native 任务已取消。

可移植设置严格限定为明暗偏好、桌面 collectionView、sort、groupDates；皮肤、
导航/密度/mobile 呈现、窗口/选中项和私有任务配置不发送。具体 wire 兼容和
owner 投影由后端 README 统一规定。组件始终显示实际能力预算：JSON 32 MiB、
密文 48 MiB、单 blob 原字节 16 MiB（编码计入总量）、1024 版本/128 设置头。
GitHub 上游的 100 MiB 限额不代表本客户端能绕过更小预算。
