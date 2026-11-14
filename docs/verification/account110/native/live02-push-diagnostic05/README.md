# 39711ae8 owned App 单次 push 首失败

精确源码 `39711ae8f6c2cc92c387a3638c92c43024dcc68e`，包已由 Cicero `c8162241` 静态独核。使用既有 live02 两端显式 owned data-dir，正常 AuthClient restore；没有复制凭据或访问默认库，仅提交一次 push。

实际观察 running 后，27.075 秒取得原生命令终态 failed，有限错误 `account_network / coordinator`，没有 syncStage/syncReason。两端自然 exit0，无强制信号，本次未复现 SIGABRT；这不是完整方向同步验收通过。

此错误标签由 SDK 错误转换生成，无法区分 enroll/sync map 或 SDK variant，不能认定 HTTP coordinator 故障、grant 失效或进入业务传输。未重试、未启动 fresh 完整 run。

`result.json` 为首回执字节原样归档；`safe-summary.json` 为有限摘要。仅匿名端标签、有限状态、聚合数、时间及静态源码/产物哈希；无正文、账户/设备身份、URL、凭据、原始 stderr。旧 live02 首结果 SHA 未变，执行后 main HEAD/clean 检查通过。owned 资料库保留待独核。
