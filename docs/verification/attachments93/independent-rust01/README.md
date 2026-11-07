# APP93 独立定向 Rust 复验

独立审查者在 review worktree 执行冻结 QA `22924793`，产品后端对应作者 `06678a98` + `129b8740`。仅在完整产品 crate 的 apple_import 模块追加 test-only include，运行后逐字节恢复；原文件前后 SHA256 相等，工作区干净。未修改产品实现，未调用 Apple Notes、用户数据、真实媒体设备或 Android。

命令、源码身份、fixture SHA、退出码及耗时见 result.json。自然退出 0，4 passed，0 failed，220 filtered，含编译与恢复总耗时 42.568 秒。使用获得排他授权的 target84；结束后确认 cargo/rustc 无进程并明确释放。

四项为：旧 raw-only/blockquote/tableCell 投影合法且只读；非法公开文档先拒绝且持久原文不变；同名普通 JSON、伪 MIME、同长度损坏及大小不匹配不误隐藏；公开保存保留唯一内部引用，严格 wire 引用集合相等，两实际 Store 接收后字节、重开和重导入 existing 保持。全部数据来自固定合成 SourceNote，OS source adapter 未调用。

本证据覆盖后端边界，不代表菜单、原生窗口或设备验收。
