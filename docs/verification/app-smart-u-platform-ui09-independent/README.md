# U 最终源码独立验证

结论 **blocked**，两个 P2 blocking finding。完整审查见 `../../plan/reviews/app-smart-u-platform-ui09.md`。这是固定 d576b50 的历史证据，不覆盖作者记录或后续修复结论。

- 固定源：`d576b50d3e72f4a85a16dcda1852c787d868d870`，基线 `7513095e6a12937fae275e730aa4890a4eb47b9e`。
- 作者 manifest SHA：`e004f398ba3ededdd0e2ff5dc1ce7984e52591c18a3f5b2e1b345624af86e45f`。463 项当前文件与固定 commit blob 全相同；每次运行前后源不变。
- 最终 Rust transport SHA：`943c2aa1a53828087037cdcec3ebf4f9db68aecef13d2fd35076d4450a344fd4`。复用作者最终 binary/harness，未改变产品模块或重编正式包。
- `run.py` 为独立有界执行记录；每条最多 600s、offline、jobs2、空间至少 2GiB，记录准确输入与退出码。`source-identity-check.json` 独立核固定 commit 的 463 个 blob；`final-source-check.json` 汇总运行及最终文件一致性。

| 目录 | 结果 |
| --- | --- |
| browser01 / browser01-data | 最终源全部九组挂载 9 pass，直接运行已审读 `scripts/check-smart-ui.mjs`，7.387s |
| browser02 / browser02-data | 独立第三行规则 1 fail，exit 1；tags/date 两行已禁用加号但 pinned 未使用，截图及 raw result 保留 |
| browser03 / browser03-data | 独立 peer 规则失配/别窗导航偏好路径 1 pass，2.381s；本窗基础选择及 settings 不改，真实投影变化，恢复规则回同 Editor |
| browser04 / browser04-data | 最终源 O 的有效旧 ACK 同序号重读、撤权旧 ACK 两条关键路径 2 pass，3.046s |
| contract01 | 既有生产 TS contract 25 pass，0.236s |
| contract02 / contract02-data | 独立 JSON `combine:["all"]/["any"]` 两端对照：TS 均接纳、Rust 均 smart_invalid，非法 all 被按 ANY 求值；断言 exit 1，0.248s |
| rust01 | Session 公开 smart CRUD/CAS/物理 owner 与 archive 边界 2 pass，80 filtered，0.238s |
| rust02 | 持久 Rust smart/shared corpus/span facts 1 pass，81 filtered，0.617s |

`check-extra-ui.mjs` 复用真实挂载 runner 的控制接缝，只添加两个独立场景与 base note 的观察；既有九组由 browser01 直接运行生产脚本，新增脚本不是替换产品。`check-final-o-paths.mjs` 复用之前已审读的 O 独立 runner，改为准确 U transport，只选择两条所需场景；`check-extra-contract.mjs` 将新增非法 JSON 同时送入生产 TS parser 与真实临时 Session。上述两个失败是实际契约反例，未通过修改 fixture 或覆写结果消除。

browser01 的最终九组弥补作者 browser14 在最终样式调整前执行全部九组、browser15 只执行最终一组样式的覆盖差异。作者 README 对这两次覆盖区分正确。浏览器是受控 Linux platform WebView 近似环境，1280×900 / 390×844；这些截图不是原生 Mac/iOS/Android 像素验收。组字是实际 DOM composition 生命周期，仍不能代替真实系统输入法。撤权旧 ACK 场景故意不送 prepare，只证明接收边界。

仅临时合成数据；无 GUI/ADB/真实用户库/正式平台构建，无依赖下载/升级/缓存清理。全部已启动进程经 finally 收束，未 stage/commit。**STOP，host target 已释放；继续窄修前请保留本目录失败证据。**
