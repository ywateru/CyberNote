# Android API 条件窄修独立复核：PASS

准确源106204bd5e7b1d986d8c3c658e18282aa23ed701；本轮只复核 reveal_owner 中 unminimize 语句前增加的 #[cfg(desktop)]。与12e5相比仅该产品文件增加一行；期间作者证据文档不属产品差异。隔离工作树导入为7bfa7bc，同一20产品输入均逐字节核对106204b。此前12e5 SOURCE-READY证据保持原样，本目录追加，不涉及任务55。

已直接核对Cargo锁定并实际使用的官方tauri2.12.5源码：WebviewWindow.unminimize位于#[cfg(desktop)]保护的impl；show和set_focus在随后没有此条件的impl。产品现在以相同desktop条件编译unminimize，桌面恢复最小化行为保持，Android/iOS编译路径省去不存在的API；原owner存活/registry身份查询、show与focus顺序均不变。官方本机源码路径/hash/相关行摘录保留。

独立隔离target运行host cargo check --locked --offline通过，原4项dead-code提示保留。没有重跑历史矩阵、GUI或真实麦克风，没有安装新依赖或读写用户数据。最初检查范围脚本把期间作者docs算入changed paths而触发AssertionError，发生于构建前；已保留setup-first.json并修正为产品路径比较，不计产品失败。

此PASS是窄静态与host验证；未运行Android交叉构建，不宣称Android编译、手机安装或设备行为通过。实际Android重建由root执行并保存其最初E0599及后续编译结果。
