# 持久媒体读取恢复67：独立复验

结论：**PASS / SOURCE-READY / RUNTIME-OPEN**。独立复验没有发现阻塞产品问题。只接收受控前端与准确源码范围，不接收准确新Mac包、真实录音、像素或整个应用交付。

作者产品 `7243c649862181d35aa94063149e30653593d7dc`，独立映射 `440467e78d481ee2b35ea4b2f15a895e518ee780`。独立基点 `667d8771f1d8693f4f137751ce0949266b6ef454` 与作者基点 `43e16f97` 的产品内容一致，只有两份文档差异。本次只cherry-pick该准确单文件产品；271项既有受跟踪产品输入在每次runner前后均核SHA并等于作者提交。

## 范围与代码审查

唯一产品改动为 `src/use-attachment-media.ts`。只对真正 `instanceof MetadataStale` 的错误重新调用完整 `readAttachment`，每个存活effect最多三次总尝试。新调用继续由原bridge捕获新stamp并进行原access/metadata双门禁；失败响应不会供给bytes/URL。新layout token在已commit身份改变时使旧生命期失效，manual retry同步封存旧token；passive cleanup继续dispose已接受源。与原id/kind/version输出过滤共同防止旧发布。

bridge、AccessGate、MetadataGate、MediaView、URL所有权、录音正文保存/ACK、journal、live-card装饰、owner、退出守卫、原生权限与所有Rust均不变。没有放宽sequence或身份校验，没有重存/重插入录音来修复读取。原资源控制器仍先停止播放再revoke。

## 独立执行

| 证据 | 结果 | 证明范围 |
|---|---|---|
| hook-attempt04/result.json | 27/27，0 page errors | 原bridge与双gate、hook、MediaView；真实旧响应被metadata拒绝→新stamp/read；两次stale后第三成功；三次耗尽与手动新version；非typed/AccessChanged；身份/迟到/unmount/manual清理；URL/controller；四种共享手机媒体source；StrictMode重放 |
| authorization-attempt01/result.json | 2/2，0 page errors | 第一次真实MetadataStale后，新read遇受控native lock/revoke拒绝，准确总read=2且停止，无URL |
| final-attempt01/result.json | 1/1，0 page errors | 实际App/Host/NoteEditor/MediaView/DesktopSession/RecordingRevisions/保存链两次pause+final完整交接，旧read拒绝后无需用户重试首显播放器，无额外写入，原A归属与B文字保留 |
| final-baseline-attempt01/result.json | 1/1预期缺陷复现，0 page errors | 同一前端链仅装入Git精确未修hook，×后首显MetadataStale和手动重试，无自动新读、无播放器；pass只指成功复现缺陷 |
| typecheck.stdout/stderr | exit 0 | TypeScript检查 |
| build.stdout/stderr | exit 0 | 前端生产构建；保留既有大bundle警告，不是native构建 |

候选独立接受合计30组，另1组旧基线缺陷证明。严格模式开发重放产生两个effect生命期，被取消的首次read不造URL，存活生命期的stale只重读新请求；只生成一个最终源，卸载回收一次。共享手机检查只为390px受控浏览器source/NodeView基本回归，audio为生成的静音WAV、image为合成SVG、file为合成文本、video只核源URL接线，不主张视频解码、Android设备、原版触摸或像素通过。

## 实际final受控trace

runner继承已独审66的独立App fixture，保留真实产品链，只控制native IPC/event、授权/stream/recorder与decode的合成边界。App只插入只读getter，useEditorCommit只增加观察点；gate包装仅记录原方法的返回值，不改变判定。最终旧read快照被持有；一次已通过native验证的响应在真实body ACK后暂缓，构造metadata推进而access generation不变的时序。该屏障不会跳过校验或修改gate。

| 时点 | 候选实测 |
|---|---|
| 第3版final持久节点读取 | read index2，metadata sequence6，access generation11 |
| 正文保存ACK/native响应屏障 | observed7；同generation11；实时overlay1、持久节点1 |
| 放旧响应 | 原metadata canPublish记录sequence6/observed7拒绝；不产生该响应URL |
| 自动完整新读 | 同id，index3，sequence7/generation11；捕获新的stamp，原gate接受 |
| 读恢复前/后计数 | stores3、body4、native revision ACK2、release0，全部不变 |
| 正常final继续完成 | journal committed；native revision3/finalIntent true；release saved true/revision3；overlay0、持久节点1 |
| 最终计数与归属 | stores3、body4、ACK3、release1；A唯一最终卡、B独立文字保留且无A卡；播放器点击播放进入暂停状态并可暂停 |

body4由A三版与B一次独立编辑组成。ACK2→3、release0→1发生在继续原final协议时，不是读取恢复写入。基线同样seq6→7、generation11，但只保留一次final read及可见错误。基线模式只由Vite装入Git精确旧hook，其余产品与候选相同；不用磁盘覆盖产品，也不把candidate源binding误当基线hook身份，result记录独立baselineHookSha256。

实际Mac19 C首显错误和一次手动重试恢复1:31仍是原始用户可见缺陷；E正常0:21首显不能覆盖C。受控trace证明一种合法竞态及修复效果，不证明C当时内部事件序列。F跨进程卡/文字视觉恢复不扩张为内部ACK或强杀保证。旧Mac18 PID8002后续检查不在，退出原因/时点未知，未重新打开或声称内存录音恢复；Android全程不动。准确新包与真实GUI仍由root另行验收。

## 审计与尝试保留

- hook-attempt01：本机listen EPERM，未进入产品测试；完整stderr和runner/source绑定保留。
- hook-attempt02：前14组通过，kind变image样本仍给了音频recordedAt，产品正确拒绝；适配器误等media。原失败/trace/runner保留。
- hook-attempt03：前22组通过，mobile audio fixture用了无效WAV，浏览器媒体错误清src，适配器误等src；原失败/trace/runner保留。
- hook-attempt04：修正为有效合成静音WAV后27组通过；没有产品改动。
- authorization-attempt01：只新增运行尚未覆盖的native lock/revoke两组，没有重复既有27组。
- 每次runner-used文件保留当次精确脚本，历史缓存目录均留在磁盘但排除Git和证据索引。所有媒体数据均为本runner合成，不读取任何真实录音。

`audit-author-evidence.py` 只读核查作者证据提交 `7309ab1cca2fda917889c09e1db1ebd7abb04c88`：20项evidence清单bytes/SHA全部等于Git对象与作者磁盘原件、21个目录文件集合完整；15个未改生产模块与作者基点一致，产品7243和最终runner/dependency绑定准确；基线3、候选25及StrictMode2组的声明与结果一致。作者中间runner版本未单独冻结这一限制保持披露；作者结果不替代以上独立30组。

本轮没有native编译、签名、应用/GUI/设备操作、访问或复制真实音频、权限变更。evidence-index.json覆盖独立证据与两个runner的全部非缓存文件；verification-summary.json记录接受范围及来源。
