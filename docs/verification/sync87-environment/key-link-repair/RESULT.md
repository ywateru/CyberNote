# 受控keylink最小修复与环境ready

2026-11-06作者结果：**ENVIRONMENT-READY ONLY**。相同新AVD/data冷启在18.751秒达到 `sys.boot_completed=1`，API30/arm64-v8a核实，监督cycle自然exit0、整体21.715秒，随后仅停止本轮owned emulator及caffeinate。未构建/安装任何APK，不证明App、provider、同步或网络路线通过；独立审查由根安排。

源码先冻结 `62ca1cf0bb8faf05eadd79a873d8df227085b168`，再执行guard、repair及第三次boot；准确入口、source SHA256、自然exit/信号及wall见 [commands.jsonl](commands.jsonl)。前两次失败的原文件及b16a4524提交保持，当前报告不会追认其通过。

|执行|自然exit|wall秒|结果|
|---|---:|---:|---|
|17项guard|0|0.079|拒绝外部key target、symlink父目录/source、既存普通key和缺key重建等|
|repair-key-link|0|0.051|AVD目录新增精确绝对symlink，指向同一已有data key|
|第三次cycle|0|21.715|18.751秒ready，API30/arm64-v8a，owned emulator自然exit0|

本轮唯一资源变化是：

```text
/private/tmp/apple-notes-sync87-environment-01/avd-home/notes-sync87-isolated.avd/encryptionkey.img
  -> /private/tmp/apple-notes-sync87-environment-01/data/encryptionkey.img
```

没有复制或重建key/data。源key在修复前、修复后与boot后SHA256均为 `522bd0b6a2c92e37de465059bb9487bb9597a9aae032b469a8ebe0b38146d8c3`，link与source为同一文件。userdata在boot前后device/inode/逻辑size一致，逻辑6GiB保留，正常OS启动使稀疏分配增加；前后metadata与 [audit.json](audit.json)保留。

## 推理与实际结果

已证布局问题是AVD content目录缺少key入口，但同一新data中key实际存在。根保全的两份AOSP分支源码均通过contentPath查key，并据 `has_encryption` 调整system的盘表索引。分支盘序公式不同，不能混用旧公式宣称本机37.1.11精确实现；这项纠正在[修复依据](../key-link-rationale.md)明确保留。[主来源哈希](primary-source-hashes.json)和只读源码关键行摘录一并保存。

实际安装版本经同file symlink后，kernel启动参数从前两次的 `androidboot.boot_devices=a003800.virtio_mmio` 改为 `androidboot.boot_devices=a003600.virtio_mmio`。本轮完整kernel中缺super错误0次、InitFatalReboot 0次，随后真实ADB返回boot_complete=1及SDK30/arm64-v8a。完整kernel压缩文件与 [owned-events.jsonl](owned-events.jsonl)提供实际因果链证据。

这支持“独立datadir key未被contentPath检测到，使安装版本盘序计数漏掉encryption盘”的本机根因；未扩展为其他版本结论。此前由PCI存在推断system盘为PCI的假设撤回：PCI为touch输入，块盘由virtio_mmio枚举。本轮没有kernel override、重复append或SDK修改；Android11 fs_mgr首匹配规则仅用于排除重复参数覆盖方案。

## 停止与保留

新serial始终为 `emulator-5584`，AVD为 `notes-sync87-isolated`。第三次owned emulator PID1735经host命令/启动时间/console归属及guest AVD名校验后，只向显式新serial发送 `emu kill`，模拟器自然exit0。owned caffeinate PID1636绑定supervisor1633，结束记录SIGTERM15，未误写为自然exit0。最终 [owned-state.json](owned-state.json)为stopped并保留ready时长；最终PID与5584/5585监听检查均无结果/自然exit1，stopped状态入口自然exit2且未发ADB。

累计3次新AVD启动、仅第三次ready。新旧完整事件中366条设备ADB命令全部显式新serial；另有版本检查，未枚举或操作原设备。17项guard同时覆盖旧/缺serial、错AVD、PID复用、错误console及keylink confinement；这些作者检查不代替独立审查。

新资源目录当前 `du -sk` 377396KiB（约368.55MiB），主机可用13182132KiB（约12.57GiB），8GiB门槛未触发，期间其他并行工作造成全机磁盘变化不归因于本环境。目录、samefile keylink与合成data保留，后续可由根在本轮新AVD安装经准确来源核对的新同步APK。共享SDK/Cargo target及原Android约13秒现场保持不动；没有cloudflared启动、路由变更、真实mic或AppleNotes操作。
