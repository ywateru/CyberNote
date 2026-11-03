# 只读窗口 PNG 工具：源码候选01

2026-11-04。状态：源码与离线检查冻结，等待独审。**真实窗口枚举、取图、权限、锁屏行为、原生背板、像素一致均未验证。**

基线 `d8f832e83349c7503b872e0e88853d1ab7b0713a`，分支 `task/tools-lossless-window-capture-01`，隔离目录 `/private/tmp/apple-notes-window-capture-01`。4工具源聚合 `838726b3629f53135c4da187002f94ab704295cc82b5d4bd541bedcec7130ff3`，详见source-manifest.json。222个App/插件/原生/依赖产品文件与基线逐字节相同；没有改主树、产品、锁、共享target/cache、设备或权限。

## 交付

- scripts/window-capture.swift：白名单bundle、精确PID/launch/exe文件身份及SHA/windowID/owner/layer/几何/原生比例前后校验、单窗SCK取图、直接PNG及独占输出。
- scripts/build-window-capture.py：仅既有Swift/SDK、全新构建目录、私有module cache用完删除、嵌入源/编译器/SDK身份。
- scripts/run-window-capture.py：固定observer及构建/源身份核验，默认15秒/最大30秒进程deadline，超时SIGKILL回收且所有中断输出不接受，不自动重试。
- scripts/check-window-capture.swift：独立编译的离线测试入口；只测试参数、合成CGImage/PNG及临时目录。

使用说明见scripts/window-capture.md，官方API与本机声明核对见docs/research/native-window-capture-api-01.md。没有目标启动、激活、聚焦、输入、AX、权限请求、数据库读取、网络或全屏fallback。list不读取窗口标题，只返回筛选后的白名单目标元数据。

## 实际编译与受控验证

独立构建目录 `/private/tmp/notes-window-capture-build02`，Swift6.3.3、SDK26.5，目标arm64-apple-macosx14.2。observer和离线测试编译均exit0、stdout/stderr空、无警告；binary SHA-256 `7899742403ad3d1323d365f751272ed09fdaac43d309acabdb8a68efc2f81c3b`。完整参数、源/SDK/编译器身份及原始输出在build-info.json。私有module-cache已由helper清理，无共享缓存。没有运行App构建。

首轮build01错误地把swiftc symlink解析成swift-frontend后调用，返回“no frontend action was selected”；只修正保留swiftc入口，未更换编译器/SDK，原失败在build-attempt-01-failure.json。build02成功。

离线10组全通过，原始stdout见raw-offline-tests.json：完整参数保持、非法bundle/UI或shell选项拒绝、缺失/重复/混合参数及数字范围拒绝、路径/token拒绝、原生尺寸边界、实际ImageIO合成CGImage直接PNG与尺寸/字节身份验证、JPEG前缀/截断/尺寸不符拒绝、旧目录/文件/symlink不变、失败清理不留成功manifest、strict在全部后端之前拒绝。

CLI7组全通过，完整调用器结果见cli-rejections.json：help、非法bundle、缺identity、非法activate选项、已有输出先拒绝、strict先拒绝，以及**仅help进程**的强制deadline。已有测试manifest字节不变，strict没有创建目录。CLI测试中的fixture PID/path/token没有传到SCK后端；未运行任何有效list/capture/permission路径。deadline结果证明调用器可终止自己的纯帮助observer，不是实际SCK挂起测试。

## 结果边界

contentRect×pointPixelScale只提供原生比例请求，整数尺寸严格匹配后才能保存PNG；不缩放后处理。PNG签名、IHDR、解码、字节数、hash及落盘字节均核验。真实输出的窗口边框/阴影、alpha、显示器色彩/HDR转换要实际观察。PNG对返回CGImage无损编码，不证明内部重采样或原始背板等价；manifest noResamplingProof固定UNKNOWN，strict提前拒绝。

公开API无法证明同进程同几何瞬时ID复用或锁屏/权限竞态；按照root确认的实际采样边界记录UNKNOWN，不建立形式化证明框架。前后实例/文件/窗口身份检查、现有权限preflight、console/login检查及单次有界调用均保留。OS自动隐私提示行为不能由“未调用request”升级为保证。正常错误清理自己的文件；SIGKILL不执行deinit，可能留部分文件或边界时刻manifest，**调用器超时的任何输出都不可作为成功证据**，保留interrupted状态并另开新目录。

独审后再由root/CUA在解锁且目标确认、同几何条件下运行metadata/取图，归档监督报告、真实PNG/manifest与后续原值对比；本候选不代表已经取得真实窗口PNG或像素通过。作者树冻结后不自合并、不运行后端。
