# 设置与手机画廊8283主线整合

状态：**PASS-AFFECTED-BOUNDARY-RESUME**。产品冻结`d73e1f30`，最终测试入口冻结`ec52b69e`，最终完整手机组主线`80964384`；包构建从`1f735ebe`开始（仅补充独审文档）。

| 主线检查 | 自然退出与结果 | 完整外层wall | 原始记录 |
| --- | --- | --- | --- |
| 首次build / production | 0 / 0 | 3.549s / 1.611s | attempt01 |
| 桌面完整组 | 0，408项 | 76.371s | attempt01 |
| 手机notes | 0，9项 | 7.174s | attempt01 |
| 手机recording | 0，43项 | 11.213s | attempt01 |
| 恢复build / production | 0 / 0 | 3.818s / 5.061s | attempt02 |
| 桌面storage-overview | 0，99项 | 18.090s | attempt02 |
| 最终手机attachments组合 | 0，290项，含preferences与quick-home | 69.003s | attempt03 |

每次产品/调试输入指纹前后不变，所有通过组pageErrors为空。最终126输入指纹`1a7374f011f8d8e89134b6068e4b8e21615a8ea12d2b437999ba7f20fbef4e94`。每个实际进程的自然退出、完整wall、启动HEAD、指纹和scope均在各attempt的result/summary中，不将CLI内部elapsed当完整进程时间。

## 两次失败与恢复

attempt01第六项失败在旧storage-overview的正向Tab断言。真实返回操作在下一帧恢复来源分类焦点，旧runner只等DOM便立即开始Tab检查。五轮自然复现和focus调用栈确认竞态；`1ad73a08`仅给测试back helper增加等待实际来源focus，原正反Tab断言保留。作者71项、不同作者11项独审通过，attempt02桌面99项通过。

attempt02手机组合随后在preferences等待手机gear超时：前序storage矩阵结束在1280px，全局reset按既有契约保留尺寸，声明mobile与实际断点不同。`ec52b69e`仅在手机preferences和quick-home入口恢复runtime声明viewport再reset；global reset不变。1280污染前置的原业务100项和不同作者14项最小独审通过，attempt03完整手机组合290项自然0。两次失败日志、HTML/几何、PNG及suite均原样保留。

`result.json`逐项比较本轮所有跟踪产品/原生/配置输入在首次、恢复、最终组和构建commit中的准确字节；它们全部相同。唯一差异是三个runner共14行等待与入口隔离。因此复用已通过且未受影响的桌面其他组、手机notes/recording，复跑受影响storage与完整手机attachments。没有将首次/第二次aggregate失败追认为零，也没有重复无关全量组。

默认后端为显式隔离JS协议fixture，真实App/Tiptap/保存队列/HTML与合成媒体；不证明Rust Store、Android WebView/IME、系统chooser或原版整窗像素。未操作原Android未保存录音现场。
