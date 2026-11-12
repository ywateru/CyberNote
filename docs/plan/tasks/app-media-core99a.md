---
id: app-media-core99a
scope: media-backend
status: done
depends-on: []
---

## objective

实现可独立测试的 Rust 媒体后端：验证受管 File、授权绑定且可撤销的租约、Range/no-Range 背压文件流、实际小尺寸缩略图缓存。该阶段不改变 App/Editor 前端，不宣称已完成用户可见媒体性能；IPC/应用生命周期接线和前端迁移由 MEDIA99 完成。

## context

docs/architecture/attachment-media.md；docs/architecture.md 的附件/Session/保存边界；docs/plan/tasks/app-media-performance99.md。

## path

src-tauri/src/attachment_media/ 新模块（由独立 harness 或仅 mod 声明引入测试）；src-tauri/src/store/attachment_media.rs、store.rs 的主键查询与受管 File 方法；Cargo.toml/Cargo.lock 的明确依赖。不得改 App.tsx、bridge、Preferences、package/Vite/release 脚本、Gradle/manifest/CSP、已有 Session 业务或 lib.rs 注册/初始化逻辑。模块可通过注入授权 callback 与既有 Session 实现真实临时 Store 测试；最终应用接线另列，禁止默认允许授权。

## verification

- 对真实临时 Store/File 测试受管范围、符号链接/大小/内部记录拒绝、缓存原子生成/命中/淘汰/失效；至少 PNG/JPEG/GIF/WebP/BMP/SVG 明确支持及不支持错误，输入/输出大小有界。平台 HEIF/视频帧另由 MEDIA99 适配，不静默读取全图代替缩略图。
- 实际启动 loopback 服务并通过 HTTP 客户端验证 Range/no-Range/HEAD/416 精确字节；64KiB 级流式 body 的峰值块有界、慢消费者背压、取消/撤权/断连释放、并发及错误 Host/Origin/方法。
- 租约签发/重新授权检查使用真实 Session/Token 及窗口关联，release/prepare/锁定/删除/替换后停止，不能用一个 bool 掩盖实际授权契约。
- 避免原件整文件读取、Base64、无界响应拼接；明确 HTTP bearer capability 边界。
- 使用共享根 src-tauri/target 可节省空间，但只跑针对性 cargo test，不做 native build。不清理其他任务产物；记录依赖大小和剩余磁盘。
- 提交后由独立代理审查；返回从工作树基线到提交的范围及所有未接线边界。MEDIA99 前端启动前先独审整合 core。

## delivery

开发 a355ea68，缓存损坏修正 f830c695；独立复审 2f90c5e5 接受。已按 8c3ce9a4..2f90c5e5 差异回填主目录；主目录 `cargo test --locked --test media --test review99a` 实际通过16项核心及2项独立坏缓存探针。生产IPC/窗口生命周期、UI消费、双端播放和性能测量仍由99B/99/101负责，不计为本阶段已完成。
