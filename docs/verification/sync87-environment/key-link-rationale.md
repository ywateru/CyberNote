# 同一隔离key的content入口最小修复

2026-11-06，根安排在原两次失败之后只进行一次相同data的有据实验；先冻结本次源码，再建立link/运行。之前失败证据与RESULT.md为当时结论，保留不改写；新结果另档。

已证本轮资源布局：`data/encryptionkey.img` 是18MiB普通文件，`avd-home/notes-sync87-isolated.avd/encryptionkey.img` 不存在。两份官方分支的 `avdInfo_getEncryptionKeyImagePath` 均只调用contentPath getter；`has_encryption` 据此决定盘表是否包含encryption。修复只添加指向同一既有key文件的精确绝对symlink，既不复制/重建key，也不改userdata或SDK。

根只读保全的官方来源如下；这是源码推理证据，不声称任一分支与本机emulator37.1.11 build逐字同版：

|本地源|来源分支/路径|SHA256|
|---|---|---|
|`/private/tmp/notes-sync87-emulator-primary/avd-info-current.c`|AOSP qemu `emu-main-dev` / `android/emu/avd/src/android/avd/info.c`|`7517b1a7dcbc6861752b99d2b012e10984e40fe2e236161581c886d2b839512f`|
|`/private/tmp/notes-sync87-emulator-primary/main-current.cpp`|AOSP qemu `emu-main-dev` / `android-qemu2-glue/main.cpp`|`ffed2998fb66765c151dd0788291530b32b3e2d3a8dc483f61a8f96e52d64b78`|
|`/private/tmp/notes-sync87-emulator-primary/fs_mgr_boot_config.cpp`|AOSP Android11 fs_mgr，根提供本地快照，准确tag未随元数据给出|`8aa204884101de7b63bb553e4d1453934ffa66087e26f14c38b950ea528603a0`|

`avd-info-current.c` 1452附近是key getter，1527附近是has_encryption，1536附近是盘表，1587附近生成dynamic partition boot device；`main-current.cpp` 3442附近将此结果写入 `androidboot.boot_devices`。Android11 fs_mgr从头解析kernel参数，首个匹配即return，故不使用重复append覆盖。

旧 `emu-master-dev` 与新 `emu-main-dev` 盘序公式不同。根此前把旧公式混用于新文件并推断绝对地址，现已明确纠正；从两分支共同可推出的是“key识别改变system盘表索引一档”，无法据本地新分支的绝对地址表证明安装版本必为a003800→a003600。实际地址是否改变、是否消除缺super并达到boot_complete，将由本次原data运行检验，不写入kernel override。

此前“PCI设备存在可能意味着system为PCI”的推断也撤回：该日志的PCI设备为touch输入，块盘在virtio_mmio模块加载期间枚举。不会执行PCI boot_devices override。

guard要求父目录/source非symlink且解析位置精确受限，目标必须是本轮既有普通data key；AVD key只允许该精确link，拒绝外部或相对target及既存普通key，不覆盖。创建前要求本轮owner/state一致、状态stopped及5584/5585无监听；创建后校验同一inode和源key前后SHA256一致。cycle现在要求link已成立，不会盲目再现已知缺key条件。
