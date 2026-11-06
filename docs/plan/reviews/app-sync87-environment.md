# APP-SYNC87 ENVIRONMENT 独立 review

2026-11-06，独立verify。审查冻结源码 `62ca1cf0bb8faf05eadd79a873d8df227085b168`、作者纯证据 `ba6ef94a3c27a4567bee4018356e51623a9b1f78`；只审本任务固定owned新环境，不改产品或原有测试。本轮证据见[独立核验](../../verification/sync87-environment/independent-review/RESULT.md)。

## Findings

1. **P3 / non-blocking — userdata分配增量的文案超出metadata。** 任务[verification](../tasks/app-sync87-environment.md)要求可审计资源记录；[作者repair RESULT](../../verification/sync87-environment/key-link-repair/RESULT.md)第20行把正常OS启动与“稀疏分配增加”相连，但`userdata-before.json`与`userdata-after.json`完全相同，base `userdata-qemu.img`的allocated_bytes均为105316352。独审当前同一文件device/inode/size也一致。du可证明整个owned目录增长，不能定位是哪一个文件。后续应将该句收窄为“目录总占用增加，base userdata的上述metadata保持”。这不影响同file keylink、guest ready或停止结论，作者证据保持原样。

**无blocking finding。**

## 审查覆盖

- `lifecycle.py:49–112`固定root/serial/AVD并约束keylink；只允许同一既有owned data key的精确绝对link，source/父目录必须为直接owned路径，禁止复制/改key、覆盖普通AVD key或缺key重建。当前link samefile及key hash核实。
- `lifecycle.py:150–186`先核state target/owner token，再核PID启动时间、精确AVD/port/data参数、console listener和显式new serial的guest AVD名；六种ADB allowlist拒绝install、任意shell和server管理。17项guard独立运行一次自然0，wall0.063960秒。
- `lifecycle.py:189–226,257–315`只用已安装工具/缓存镜像，独立AVD/user/emulator HOME与data，至少8GiB剩余，明确2GiB/2核/6GiB稀疏data/no-audio/no-snapshot/no-camera。现有本轮资源不重建；本次源码审阅与证据已覆盖关键边界，无额外boot必要。
- `lifecycle.py:229–254,303–314,348–359`仅清理本轮PID/Popen child，信号前重核身份，自然exit与signal分别记账。额外4个mock-only独立探针验证stale identity/fallback recheck和0/−15记账，不触及真实进程。
- 父manifest72项、repair manifest31项重算通过；历史39项对b16a4524核实，除README后续引导外38项原失败文件逐字保全，旧事件为新事件前缀。累计366条针对设备的ADB全部显式new serial；三次启动仅第三次ready，前两次wrapper exit2没有追认通过。
- 第三次ready18.751秒、wrapper自然0/wall21.715秒、emulator自然0、caffeinate SIGTERM15；kernel实际boot_devices为a003600，旧诊断为a003800，第三次缺super/fatal行0。已存官方分支源码只用于共同contentPath/has_encryption推理，不混用盘序公式断言安装37精确版本。
- 新资源当前state stopped，owned历史PID及5584/5585检查无输出/自然exit1；源脚本前后SHA256及冻结源码一致。独审未运行lifecycle、ADB或emulator，所有输出先写/private/tmp后复制；原旧AVD/旧serial/未保存录音现场完全不触碰。

## 结论

**pass — ENVIRONMENT-READY ONLY。** 接收这次已存在owned合成Android环境的工具安全边界与第三次ready证据。后续准确新APK安装、App/provider/Sync/VPN和完整87验收仍独立pending；本review不授权改变原设备保护约束或重建userdata。没有生产代码、原有测试、SDK/镜像或路由变化。
