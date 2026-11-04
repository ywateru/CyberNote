# U-F1/F2 修复独立窄复验

**pass，仅两个源码边界及必要回归。** 详细报告 `../../plan/reviews/app-smart-u-boundary-fix13.md`。旧 d576b50 blocked 报告与全部失败证据保持原样，不被本次通过覆盖。

- 准确产品 commit：`8e8fe7e320e34a2b9c27bf7c7e794662ad988da4`。
- manifest SHA：`0940c3cb398ae82cf703f60136dbaa10614975d77f08f99fa7532e8dc3ce59ad`；466 项当前文件、固定 blob、manifest 一致，每条运行前后无源变化。
- 复用原真实 Session transport，SHA：`943c2aa1a53828087037cdcec3ebf4f9db68aecef13d2fd35076d4450a344fd4`。没有 Rust 生产/样式/Editor/协议/依赖变化。
- `source-identity-check.json` 核对固定源、旧 53 项证据及当前产物；`build-identity-check.json` 对照作者最终 build 的 before/after 源和实际 dist；`final-source-check.json` 保存检查结果及旧 blocked 报告/index 的不变 hash。

| 目录 | 结果和范围 |
| --- | --- |
| contract01 / contract01-data | 旧失败 `check-extra-contract.mjs` 文件不改、直接运行：两数组现在 TS 与真实 Rust 一致 smart_invalid，0.281s |
| browser01 / browser01-data | 旧失败 `check-extra-ui.mjs` 文件不改、直接运行其 independent-third 场景：tags/date 加号可用，从第一行后新增 pinned，2.338s |
| contract02 / contract02-results.json | 已审读生产 TS 检查，30 项通过，包含两非法数组与同规则 all/any corpus，0.335s |
| rust01 | 既有 production Store harness 的单项共享 corpus 测试，14 合法查询+12非法查询，1 pass/81 filtered，0.501s |
| browser02 / browser02-data | 只选择扩展第三行场景；新增/插入/已用禁用/拒绝保留零创建/移除重加/最终真实保存，1 pass，2.800s |
| contract03 / contract03-results.json | 新独立四组已知 facts × all/any，8 个值通过；同时检查共享 corpus 含两数组和同一规则两模式，0.229s |

六条命令均 exit 0，无新增失败。`run.py` 拒绝覆盖已有 attempt，核对准确 manifest/binary 并记录每次源前后 hash、命令、退出码和空间。`check-mixed-combine.mjs` 是仅新增的独立行为探针；其余复用已审读检查，原探针的旧输出未改。

第三行截图是实际生产表单的受控挂载状态，不能作为 native/device/像素 pass。没有重复完整九组 UI、host check、全 Rust 或平台构建；准确 source 的既有最终 TypeScript/Vite build 身份已独立核对。后续完整规则、原版未证交互及准确双端包/设备验收不属于本次结论。

临时合成数据；无 GUI/ADB/用户库/原版删除。locked/offline/jobs2/每条600s/空间≥2GiB，无下载升级缓存清理，无产品及任务/index 修改，无 stage/commit。**STOP，host target 已释放。**
