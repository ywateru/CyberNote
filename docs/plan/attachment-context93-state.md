# APP93 当前交接状态

本轮用户请求：导入不添加可见“Apple备忘录原始记录.json”附件；全部用户附件有右键菜单。最新任务为[APP93](tasks/app-attachment-context93.md)，UI见[附件菜单](../ui/attachment-context-menu.md)。上一轮APP92/Mac30已完成，旧goal为complete，不恢复Android/同步/来源探测。

根主线基线f0c1c29e，规格2af34667→3cf9c257→4d3722e3。作者 `/root/attachments93_develop` tree `/private/tmp/apple-notes-attachments93-develop` branchcodex/attachments93-develop；独审 `/root/attachments93_review` tree `/private/tmp/apple-notes-attachments93-review`。docs-sprint流程：root文档/合入，作者实现，不同代理独审；代码不得main直接写。

内部记录保留既有serialized attachment reference保持严格wire兼容。public正文投影剥除有效RAW_MIME+真实owner记录引用，workspace元数据可带internal:true派生标记供用户表面过滤及lock/conflict能力，标记不进入持久化/wire。saveNote先验证原输入，再合回原owner内部ref，回包与workspace一致。新旧普通卡/附件浏览/含附件指示均不显示raw，数据管理如实计占用。普通同名JSON/坏记录不误隐藏，正常附件导出拒内部raw。备份、重开、去重及两实际Store严格wire/publication必须定向验证。

backend作者冻结06678a98→129b8740已交独审，尚未合main；source-only原mut及raw-only/嵌套block+投影非法问题已窄修，作者full产品manifest apple_自然0/32通过1真实source ignored。原误对lean harness跑test的配置缺失失败保留，未当产品验证通过。新immutable lean02已编译供DOM使用。菜单typecheck初版通过，源码/runner将冻结后执行实际DOM。尚无Mac31。shared target `/private/tmp/apple-notes-sync84-target` 已由作者明确释放，现独审获排他运行预先冻结22924793四个独立反例，结束需主动释放。复用92真实ReactDOM+Rust transport，不再造框架，不重复广泛旧网络/设备suite。

全部测试隔离合成Store/媒体/OS，禁止读取或修改真实Notes/用户DB/麦克风；不启动/停止/安装/读取任何Android设备或旧AVD，原约13秒未保存录音现场完全保持。最终通过后只打Mac31（新artifact目录），保留Mac30/Android21，并独审动态input/ZIP/内嵌前端/JXA/实际entitlement和strict signature。无新增用户permission需求，授权沿用。

独立菜单fixture已冻结123d460f+7cbe4f03，待精确UIfreeze；覆盖四类型、移除Undo/Redo、键盘/信息/Esc/视口、owner失效及迟到picker。所有首失败保留，source-only不等同runtime。当前原Mac30派生包/Android21保持。
