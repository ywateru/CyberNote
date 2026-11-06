# 主线80/81组合回归

源码合入 `44ea616bd29804ceabe8dce18947925c6e3524d7`，122输入指纹 `0818145c2f31dc49b58cba93ba30711747e82c405cdb6bc0923b14bc92457ab9`，前后不变。六项均自然退出0，没有超时截断或强制结束，所有浏览器 pageErrors=[]。原命令/完整wall与退出码见[result.json](result.json)，驱动保全为[driver.py](driver.py)，原始日志同目录保留。

| 检查 | 结果 | 完整wall秒 |
| --- | --- | ---: |
| pnpm build（含tsc -b） | pass | 8.322 |
| production调试入口排除 | pass | 3.119 |
| desktop all | 356项 | 85.550 |
| mobile notes | 9项 | 11.128 |
| mobile recording | 43项 | 13.791 |
| mobile attachments | 197项 | 63.642 |

桌面与手机附件已包含图片预览、存储总览/备份可用性/公开导航及原79回归。手机浏览器使用合成平台，未安装或操作原 Android 设备；硬件、原生provider及原版整窗像素不由此结论代替。summary/catalog/suite保留各次实际覆盖和原始限制。
