# 附件稳定性与数据管理79交付

2026-11-06。本轮功能已完成限定源码、真实Rust、程序化界面及双端构建/独立核包范围。前端产品最终1e16c9fe、后端2420faa8、runner ad982ee8；主线六项冻结源ff3e9a19，构建源9afb86b1e18932e59f890d6d6cdb532082ea59b9。后续文档提交不改变产品输入。原Android未保存录音现场保留。

## 结果

添加附件原来会在存前/存后trusted校验时开启全屏access-cover，metadata刷新并发还会再次触发强同步。正常同authority校验现采用quiet呈现，保留原权限、owner、正文版本和实际Host commit。异步陌生authority先实际提交保护遮罩再hydrate，强同步、prepare和失败不降级。修前171帧中94帧遮挡；最终独审正常89帧与13次DOM mutation均无遮罩/隐藏/节点替换。

图片卡“保存图片…”、点击预览“导出原图…”、管理行导出统一按ID输出原字节。媒体位于本地attachments目录，SQLite及operation journal保存元数据/引用；没有无谓迁移或重编码旧媒体。原字节已在真实Rust→App及新PID回读比对。

更多设置和设置页新增数据管理。显示真实根目录、DB/WAL/SHM、全部附件/缺失/未归属文件与目录、实际文件大小、mtime、类型/引用/权限状态、各分类总数与警告；支持刷新、搜索、类型筛选、分页。未知时间/大小不伪造。只读统计不vacuum/checkpoint/清理旧音频或恢复数据。

完整备份为.notesbackup逻辑归档，包含已保存笔记、文件夹、设置及登记附件；不称为裸SQLite文件拷贝。导入合并、冲突副本保留原记录，导入设置会应用。活动录音未结束时禁用备份，导入继续真实App保存→ACK→Rust提交；保存失败实际false ACK→abort且原库保全。Android URI走host-only有界ContentResolver流，拒自身provider目标，不把URI当本地PathBuf。

## 验证与本地交付

[独审](../../plan/reviews/app-data-management79-static.md) SOURCE-READY；真实Rust43、实际Rust→App28（含false ACK）、Kotlin独立36、并发3、修后源链12及最终新组33均自然通过。作者真实Rust74与Kotlin14另见[后端](../data-management79-backend/README.md)。[主线六项](integration/README.md)全部自然0：build/production、桌面230、手机笔记9/录音43/附件75；95输入84791745404687c6de66f83383f9519ebbb4028280df326a659c6557730726d1前后不变，pageErrors为空。

| 交付 | 本地文件 | SHA256 |
| --- | --- | --- |
| Mac24 | [ZIP](../../../artifacts/data-management79/备忘录-Mac24.zip) / [应用](../../../artifacts/data-management79/备忘录.app) | b6fe404f4f2090cc6c6504a339f56b4d4f6a77bfe312d999a884968a1be8a5be |
| Android构建14（arm64 debug，未安装） | [APK](../../../artifacts/data-management79/备忘录-Android14.apk) | 8eeb51ff8b4f95f152d8a48a19b8ef5addf5e0201ac327e6f2aa53931128f6d6 |

[Mac构建](native-build/README.md)28.487秒、[Android构建](android-build/README.md)82.457秒均自然0，288跟踪输入前后不变。[独立核包](native-independent/README.md)核实际MachO/ELF内嵌资源与固定前端快照、源码输入、签名和归档完整性。原始Mac app保留；仅派生adhoc app用于交付并通过完整strict验证。

## 边界

源码/磁盘/浏览器、构建/核包、真实OS设备及原版像素是不同结论。Android ContentResolver/provider真实选择/取消/撤权/磁盘故障、OS多窗、原生实包运行和Apple Notes整窗像素继续开放。未安装或读取原Android，未用真实麦克风，未操作原版删除实验。调试CLI收尾曾出现耗时波动，所有失败/143与自然慢退出原件保留，不声称显式预构建已证明唯一根因或普遍加速。最终主线六项均自然正常结束。
