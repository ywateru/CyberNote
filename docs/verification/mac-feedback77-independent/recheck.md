# Mac截图修正77：独立复审

2026-11-06。结论 **PASS / SOURCE-READY**，限定冻结源码与以下受控浏览器范围。初审报告和所有失败保持原样；不授予整窗原版像素、原生Mac/AppKit、实际手机或系统菜单精确几何通过。

源码freeze `f7b3c944`（产品修复`e760ece7`，首版产品`806d3432`）；89项实际输入SHA256 `b4d046b7945f3d1422ffe095fd04cc67671f7e5989ebb194293fb90dc521182a`，两条独立命令开始/结束指纹相同且产品/runner gitDirty false。实际App/Editor/保存队列/菜单事件仍真实，IPC/device为仓库隔离JS协议fixture，无原生应用或用户数据。

独审编写自己的`independent-runner.mjs`，通过公共runtime启动真实App，不调用作者mac-feedback断言。51检查自然exit0，`/usr/bin/time`完整进程14.42s，含cleanup内部14.332s。独立`deadline-recheck.mjs`六场景自然exit0，完整进程2.88s，含cleanup内部2.783s。两者pageErrors[]；精确命令见commands-recheck.json。

- **底部与合法入口**：Mac底部新建按钮不存在，更多按钮右对齐；真实顶部“添加文件夹”打开smart-form新建普通文件夹，再经folder.cancel关闭。
- **连续字形修复**：对“甲乙搜索丙丁”同一正文取每个字符Range，高亮前后每个x/width差<0.05px，旧4px空隙关闭；查看fixed-continuity.png，字符连续。
- **最窄列表远命中修复**：真实settings 220→280→220；220显示“...搜索结尾”（实际省略符为…），命中26px完整位于snippet-copy右边界412内；280恢复六字上下文“...上下文上下文搜索结尾”，再缩窄恢复紧凑摘要。每态保留字符Range/HTML/PNG，避免用textContent冒称可见。
- **搜索安全/独立状态**：大小写混合、中文重复、`[x]`/`a+b`/`.*`及看似HTML的img字符串均按字面量高亮；React无img/script节点；computed橙黄与透明背景。清query移除高亮，正文find仍为codex且与列表搜索“搜索”独立，保存document逐字未变；远普通英文命中可见，锁定行无正文泄漏。既有锁笔记结果集语义未被重新定义。
- **真实右键与目标**：使用page.mouse.click(button:right)，未选A菜单置顶只改A，编辑仍B；滚动寻找B后新事件重取位置。菜单resize720×360后为x464/y61/w248/h291，右712/底352，均距视口8；隐藏侧栏、调列表宽、画廊下边界clamp通过。零坐标contextmenu验证可见卡片锚点（不是声称已测真实系统键盘）；关闭重开取新point，toolbar more仍独立top52右锚。独立查看resize-context.png/gallery-context.png。
- **截止行为**：真实App async false在750ms截止前22次callback、带真实lastState；真实App delayed true在140ms完成且4次callback，排除Promise truthiness；真实App late true/never settle分别正确TIMEOUT。给真实page.evaluate的首传输额外150ms而deadline60ms时predicate0调用、无lastState且59.43ms正确TIMEOUT；永悬transport亦正确超时。`runtime.mjs`在首版到新freeze之间完全无diff，没有制造lastState。

作者六项回归由开发另行执行/留证（build、生产排除、desktop148、mobile notes9/recording43/attachments43），本agent不将其冒充独审命令，也未并发写dist。主线完整整合仍由根执行。原版参考图未展示已打开右键菜单，不声称其像素几何已复刻；当前Chrome证据无法替代WKWebView字体/系统材料或完整原版像素验收。原Android13秒现场保持不动。

独审runner相对初审更正了两处错误定位器，并将“锁定正文匹配不能出现在结果集”过强断言改为任务实际要求“锁定结果不展示正文”。此调整及原失败独立保留，不删除或追认旧失败为通过。
