# APP93 当前交接状态

本轮用户要求：正常来源附件照常导入，只取消应用额外生成的“Apple 备忘录原始记录.json”等可见记录卡；全部用户附件增加右键菜单。同名普通 JSON 仍然显示。规格见[任务](tasks/app-attachment-context93.md)、[菜单 UI](../ui/attachment-context-menu.md)。APP92/Mac30 已完成，旧 goal 为 complete，不恢复 Android、同步或来源探测。

遵循 docs-sprint：root 维护文档、合入；作者 `/root/attachments93_develop` 在 `/private/tmp/apple-notes-attachments93-develop` 实现，不同代理 `/root/attachments93_review` 在对应 review worktree 验证。主线 backend 作者06678a98→129b8740已合入8c4d1190→53872301；菜单d365425d→6b8b2829→6eb1da6d→cf5be539→63d1fd70完整合入3160c360→c9554422。独立DOM脚本/证据已合入ded9a5e7；作者新增普通PDF/WAV/TXT、实时卡和Undo尾段断言的6246ef66待实际结果后合入。

内部记录沿用既有受管文件/serialized attachment reference，保持严格 wire 兼容。Store 只对 owner、保留 MIME、大小及真实 RawRecord 均有效的节点作 public 投影；workspace 派生 internal 标记不入持久化或 wire。saveNote 先验证公开输入，再合回原 owner 内部引用；旧记录只读投影不改时间/revision。数据管理仍如实计内部占用。普通同名文件、损坏/伪造记录不误隐藏。

后端作者完整产品 apple_ 测试自然0，32通过/1真实来源ignored；独审四个真实Store反例自然0，覆盖空嵌套合法投影、非法输入先拒、同名普通JSON/伪MIME/损坏/大小、内部引用唯一及两个实际Store严格wire、重开和重复导入。证据见[独审Rust](../verification/attachments93/independent-rust01/README.md)。shared target84 两代理均已释放。

独立菜单DOM02自然0，6/6通过、含清理14.091秒：真实React/Tiptap的四类右键、真实新笔记FileChooser插入后的移除/Undo/Redo、键盘/信息/Esc、四角和缺坐标回退、owner切换、保存框期间迟到export拒绝。原DOM01定位/目标方法问题与独立真实Undo失败保留。Undo合并历史的产品缺陷由closeHistory修复；作者导入fixture末尾atom在Undo后由既有TrailingNode补标准空段，另记录全部原节点/属性还原及唯一允许尾段，不以漏附件为成功。见[独审DOM](../verification/attachments93/independent-dom/README.md)。

接下来完成作者扩展实际App DOM、正常浅色卡片菜单截图和typecheck/Vite/生产调试排除，收档完整源身份后给Mac31构建准入。只打新artifacts/attachments93，不覆盖Mac30/Android21。不同代理只读核对动态产品输入、ZIP、内嵌前端/JXA、真实entitlement和strict signature；目前尚无Mac31，不提前声称交付完成。

全部数据为隔离合成Store/文件/媒体，OS来源与对话框为合成边界。不读真实Notes/用户数据库/麦克风，不操作任何Android设备或AVD，原约13秒未保存录音现场完全保留。原生来源附件导出/完整像素与设备运行不由DOM结果代证。主线未跟踪output/imagegen为既有内容，保持不动。
