---
id: app-smart-draft-hydration16
scope: Preserve persisted pinned false when reopening smart-folder drafts
status: done
priority: P1
---

## Observed problem

2026-11-05 root在准确Android05 APK a6f94fe3c397a6078116c5f2d6c3190ae5091afa214b7005307973f57ef96322发现：测试智能目录指定真实#QASmartU09Android+置顶include，count1；编辑置顶为“不包含”并改名-R1后count0；force-stop冷启保持count0，但重开编辑过滤面板显示“包含”。证据verification/android-smart-u-runtime09/29、30、31、33、35、36；36文件名虽cold-persisted-exclude，图像实际包含，不得误认通过。root取消该错误draft，没有再次提交。

源码smart-draft.ts将持久PinnedRule的`value` spread进带`pinned:true`默认的DraftRule，却没有映射到draft字段pinned。draftQuery保存使用pinned，因而false重开变为true，用户即使只改名也可能悄悄改变已存查询。影响共享Mac/Android，早于geometry15，不能称为其引入。

## Contract and fix boundary

```text
持久 {type:pinned,value:false}
           ↓ 明确字段映射
草稿 {type:pinned,pinned:false}
           ↓ 只改名 / 取消 / 原样提交
保留查询 false；取消不提交
```

这是已有“重开填已保存定义”契约的修复，无新语义。开发者在geometry15独审STOP释放后才可改源，保留geometry15两文件。仅最小修正folderDraft持久→草稿适配，拒绝以默认true覆盖false；继续克隆标签names数组、保留combine/id/revision；不升级schema、不动Rust查询/存储/媒体/工具。用独立truth table覆盖true/false、单独置顶/标签混合、all/any、draft→query往返和实际生产React重开/只改名保存/取消路径；不得只测新辅助函数或实现常量。保存拒绝/CAS等既有契约不应改变。

新verification/app-smart-draft-hydration16/保存原失败、最终作者检查和source manifest；不得正式平台构建/shared target/cache/GUI/ADB/DB/Git/下载。SOURCE-READY STOP后不同作者独审，再root固定准确新包实测。根设备数据保留，不删除原版，不将源码修复当新包运行通过。

## Gate

false必须在重开、改名提交和正常/冷重启后保持同一查询；true也不能回归。geometry15仍仅其普通表单窄范围，U/device09总体仍open；移动错误反馈及context文字误选另项处理。

## Source acceptance

作者280断言前70失败/后0失败，独立329断言0失败，真实基线反例、非法值拒绝与两端冲突重试通过；root读报告且核12项独立证据全部匹配。仅smart-draft.ts显式value→pinned一行，geometry15源保持。独立报告plan/reviews/app-smart-draft-hydration16.md，索引e598339443c8aaf0118a2137b6f3eb6f26657dfbfd48bef3c50de2fb60a44f64。SOURCE-REVIEW PASS；准确包与实际重开/冷启待验，旧Android05原失败保留。

## Actual package acceptance18

2026-11-05追加：源de372的准确Mac10 exe56742e38…与Android06 APK8609231f…已分别经470/385项包独核；两端实际运行记录及不同作者有限静态复核均pass。Mac26/27保存不包含、28重开、29只改名-R18、30重开与正常退出后新PID35均保持false；Android06/11改名-R2后、16强停新PID后均显示不包含，计数1，合成note置顶后0、取消置顶后1。初始true回填有限观察保持；没有本轮另行true保存重开循环。详见[根接收](../../verification/folder-fixes-runtime18-root-acceptance.md)、[Mac独核](../reviews/mac-folder-fixes-runtime18.md)、[Android独核](../reviews/android-folder-fixes-runtime18.md)。

done仅此false草稿回填及列明实际路径；原失败留档，完整智能功能、日期规则、IME、多窗及像素仍open。
