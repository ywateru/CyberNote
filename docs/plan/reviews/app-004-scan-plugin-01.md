---
id: app-004-scan-plugin-01
task: app-004-scan-plugin
baseline: 9340dba
result: pass-module-checks-runtime-deferred
date: 2026-11-03
---

# APP-004 独立扫描模块审查 01

本轮独立模块检查通过，未发现阻止继续集成的已证实问题。**这不是 APP-004-scanning 或主应用功能验收通过。** Android 设备运行、宿主复制/提交和主应用入口没有执行，仍须后续验收。

验证只使用 `9340dba` 的插件目录；检查前后未改生产代码，模型清单中的全部源码 SHA 与开发者证据一致。没有将其他代理正在修改的主应用当作测试基线。完整日志、原始结果和可复现探针见 `docs/verification/qa-scan-plugin/README.md`。

## 已执行结果

1. Rust 会话测试 2/2、独立 API strict 类型检查及 Android Rust 目标离线检查通过。
2. 重新无窗口生成受控中文/空白图，经真实 SessionStore→ImageIO→Vision 调用。中文逐行精确匹配，空白图返回 empty；两次均在 ready 后销毁/重建 store，清单一致，真实读取文件并确认清理。
3. 独立外部探针针对真实会话、真实图像执行跨会话 token、路径/符号链接、分块字节、读取限制、ready 不可变、ack 失效、过期和 8 会话限制等检查，通过。探针最初对符号链接错误码预期有误，修正为代码已有的 invalid_token 后在新目录通过，原始失败日志保留。
4. Android `--offline --rerun-tasks assembleDebug testDebugUnitTest`，109/109 tasks 实际执行、39s 成功；JVM 2/2 通过。没有以缓存命中或构建离线推断设备 OCR 离线运行。
5. 独立 ZIP 读取确认 APK 中 25 个模型资源共 2,490,310 字节，中文 Hani 资源及四 ABI OCR 原生库齐全，逐文件 hash 与开发证据一致。当前重建 APK 为 54,016,095 字节、SHA `6c0ec0c3b90f0dec4b2389d2f4fd510ddc1f818fdeb983e211ee30f57d310939`；AAR 为 75,487 字节、SHA `df8784c0940efd85ed76a53393b601b02d0060de788c589ee7e0116742c3da3c`。APK 与旧包整体 hash 不同，不宣称完整产物逐字节复现。

## 关键边界审查

- Rust IPC `Request` 拒绝未知字段，无任意路径/noteId 参数；SessionStore 私有 UUID 会话与文件归属检查、普通文件检查、TTL/容量/状态限制清晰。桌面调用经共享 mutex 串行化；这部分路径与状态有实际探针结果支持。
- Android SessionStore 用进程内公共锁保护清单/资源变更；识别不长期占锁，返回后重新查会话/状态。cancel 直接删除，晚到结果应不能重建删除会话。该判断来自源码审查，**未运行 Android 竞态**。
- Android 原始图像字节、旋正图、校正图和页面引用分别保存；PDF 是 PdfDocument 绘制图像，不是虚构的成功结果。这里只确认实现路径，**未实测透视/PDF 内容**。
- `copy_file_to` 仅为宿主 Rust 接口，要求 ready 与文件归属，目标使用 create_new，校验分块偏移/长度/EOF/总量，失败移除新建目标。宿主负责选择受管暂存路径、核对目标笔记修订/选区并在附件与笔记持久提交后才 ack。**本轮只审查复制契约，没有实际运行该宿主接口或崩溃恢复闭环**。
- Android 模型依赖选择 bundled 入口，实际模型字节已查验；合并 manifest 的网络权限不代表本地识别依赖网络，也不能据此证明首次断网正常。AAR 本身不携带全部传递依赖。

## 后续验收边界

取得设备交接后，实际执行首次断网/无 GMS 中文与空图 OCR、选图/取消/权限、真实相机、四角/透视/滤镜/旋转/改序/重拍/删除、多页 PDF 解码内容和页序、冷启动/过期/晚到 OCR。主应用接入另需真实 invoke→模块→宿主附件复制→笔记事务→重启/归档链路，目标笔记/选区漂移检查和 UI 对比。上述项目当前均 unknown，不应关闭完整扫描任务。
