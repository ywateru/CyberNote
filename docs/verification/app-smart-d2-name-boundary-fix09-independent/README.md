# D2 名称修复独立复验证据

**pass，STOP；共享 host target 已释放。** 固定源码 `9bdc441f7791a53de99baba58e6d0244d5849f6c`，关闭前次普通文件夹超长名称成功写入后不能重开的 P2 blocking。

- `fixed_original.rs`：从旧独立反例保留同样 create/rename 4097字符输入，新预期要求写前 invalid、整个临时目录字节和工作区不变，并正常冷重开。
- `harness/`：直接引用生产模块，未复制实现。`folder_name` 过滤器同时执行上述独立 case 与真实生产边界测试，**2通过、0失败、71过滤**。
- `run01.txt`：完整编译和窄测试日志，exit0，6.291秒。
- `inputs.json`、`result.json`：固定提交与作者全部18个输入逐项匹配；前次 D2 其他九项身份不变；运行前后源码不变，旧反例及 run04 失败证据 hash 不变。offline、locked、jobs2、600秒上限，最低空间约70.4GB。
- 审查报告：`docs/plan/reviews/app-smart-d2-name-boundary-fix09.md`。

旧 `app-smart-d2-durable-rules09-independent/run04.txt` 原样保留，未将新成功覆盖到旧失败。没有重跑作者全量69项或宿主 check，没有改产品、作者证据、用户库或平台包，未 stage/commit。O/U 和设备/像素验收不属于本轮 pass。
