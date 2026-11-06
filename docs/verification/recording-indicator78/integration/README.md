# 录音78主线整合

2026-11-06。结论：PASS，限定真实前端、合成媒体和JS协议fixture。开发产品206557bb、runner8fc060dd已独立通过48项及桌面/手机静态布局对照，合入主线e4276d8b。主线随后串行运行六项检查，全部自然exit0，没有重试。完整原件在`/private/tmp/notes-recording78-root-vz94rbge`；本目录保留命令日志、summary/suite/catalog及驱动。

| 命令 | 结果 | 完整进程wall |
| --- | --- | ---: |
| pnpm build | 通过 | 7.687秒 |
| production调试入口排除 | API、URL和Mock标记排除 | 2.779秒 |
| pnpm test:debug | 11组197项，含新增49项 | 49.873秒 |
| 手机notes | 9项 | 6.436秒 |
| 手机recording | 43项 | 13.198秒 |
| 手机attachments | 43项 | 47.562秒 |

五个浏览器summary均记录sourceHead=e4276d8b、pageErrors=[]、sourceInputsChanged=false；90输入均clean、前后SHA256为`09fb9ee8b4702499400963dbf4f16693cd5c8646565f06823aa9daeb39f4b9ce`，与开发/独审冻结源相同。总驱动result.json前后指纹相等。各命令wall包含最终清理及退出，不用CLI内部elapsed冒充完整进程时间。运行后主线52056b4a仅整合重复的调试文档，没有更改任何源码或runner输入。

采集中真实点击✓和×、原A正文确认/唯一引用/登记释放、暂停继续、失败及checkpoint等待、旧ticket迟到、切B编辑、列表/卡片标识、reduced-motion和窄列表均在完整组通过。正文双次故障的既有全局错误条仍按“全局重试→侧栏✓”恢复；未用dismissError替代确认，没有把遗留全局提示问题混同为音频丢失。

不接触原Android现场和约13秒未保存音频，不调用真实麦克风或读取用户笔记。此整合不证明Rust持久化、原生WebView/系统设备或Apple Notes整窗像素一致。Mac23实际资源、签名和归档核对单列于native-build及native-independent。
