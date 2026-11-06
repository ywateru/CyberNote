# 手机入口viewport污染的独立最小复核

**PASS-FOCUSED，14项自然exit0，完整外层7.535949625秒。** 两处runner入口冻结提交 `ec52b69eb5bc636b84704bdc31f1eb250eb3a51d`，作者证据HEAD `31b85758`。126项输入指纹前后均为 `1a7374f011f8d8e89134b6068e4b8e21615a8ea12d2b437999ba7f20fbef4e94`。独立逐文件核对78src、index.html和global `scripts/debug/runtime.mjs` 共80项与产品d73逐字节相同，见 `final/product-identity.json`。

根attempt02的desktop storage-overview已经通过，但mobile attachments前序storage矩阵结束于1280px后，preferences手机分支等待实际mobile gear超时。原失败位于主线 `docs/verification/mobile-home8283/integration/attempt02/mobile-attachments/`。只读检查显示global reset仅重置fixture并reload，不改viewport；`runtime.mobile` 保留设备描述，App实际布局由当前width决定，不能用前者代替后者。相邻quick-home冷启也依赖手机viewport。

修复仅在preferences mobile入口增加4行、quick-home入口增加2行，先恢复 `runtime.viewport`，再调用原reset，保证初始化时 `initialMobile` 取得真实手机宽度。未改global reset、runtime平台边界、src或原业务断言。

独审使用一个受控mobile runtime，对两个入口分别构造实际1280px→global reset，先确认仍desktop且无手机gear，随后调用**真实runPreferences／runQuickHome函数**，通过各自首个原业务check后抛出专用Symbol停止，只执行必要入口前缀。再独立检查当前精确390×844和`.app.mobile`；preferences确实使用真实gear打开单一共享设置、关闭恢复gear焦点；quick-home冷启all/null/无隐藏Tiptap，真实＋仅一次持久create并focus确切新editor。没有复制入口逻辑或重跑完整preferences/quick-home/attachments组。

14项、完整外层自然退出与wall见 `final/process.json`、逐项结果见 `final/result.json`；两个入口实际HTML、viewport/selection记录及前后指纹同目录。驱动SHA256 `1507f44e6ac37ea615354112f159f3eba3756f4515a81ffd7ab915babb73d1de`。没有页面错误。所有输出先写 `/private/tmp`，runtime cleanup并释放index/dist后再复制保全。

最终完整mobile attachments由根恢复后执行，首轮及attempt02已通过结果按精确相同产品与对应runner输入复用。本次不宣布完整组合交付通过，也不证明真实Android IME/provider、Rust Store、真实麦克风或原版整窗像素；原Android未保存录音现场未动。
