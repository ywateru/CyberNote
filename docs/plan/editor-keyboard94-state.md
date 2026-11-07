# APP94 当前状态

当前任务为[标签回车提交与正文 Tab94](tasks/app-editor-keyboard94.md)，用户最新反馈这两处键盘缺陷；APP93/Mac31 已完成，不重做附件/同步/Android旧验收，无新goal。

root负责文档/合入；原作者 /root/attachments93_develop 使用原tree /private/tmp/apple-notes-attachments93-develop 的新分支codex/editor94-develop，独审 /root/attachments93_review 在原reviewtree新分支codex/editor94-review。两者基于主线d09a26e8，架构规格随后bf40620d。docs-sprint明确允许并要求作者实现/不同代理审查，不写main产品。

已定位：NoteTag只在handleTextInput ASCII空格提交；Editor仅Escape键处理，无普通Tab fallback。作者拟用本次Enter事件捕获合法tag范围、原keymap正常split后同次appendTransaction提交mark，保证一个history event和下段无mark；普通Tab在table/list更高优先处理之后用低优先keymap插入字面制表符。要求pending仅本次实际Enter变化、无延后误提交、多Editor/IME/代码链接/权限保护；同时评估软键盘beforeinput insertParagraph路径，不把共享代码Mac按键通过当手机设备通过。

独审先冻结真实旧Enter/Tab失败，随后对作者精确freeze定向复验。全部数据隔离合成，禁止真实Notes/用户DB/麦克风及任何Android设备/旧AVD操作。原未保存录音继续保留。target84当前自由但使用必须先明确交接，不新建大缓存。通过后以最终main精确source构建新Mac32到artifacts/editor94，保留Mac31；不同代理只读独立核包。未跟踪output/和tmp/为既有内容，root不清理。
