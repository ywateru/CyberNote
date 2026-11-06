# Apple Notes 复制导入：来源能力研究（APP92）

2026-11-07，本机 macOS 26.4 / 25E246。只读取系统 Notes；附件 save 只尝试写入研究者新建的私有暂存目录。没有修改、移动、删除源笔记，没有读取源 SQLite。真实标题、正文、来源 ID、附件名和错误描述仅在 mode0700 私有临时目录，均未提交。

## 当前可用能力与真实证据

本机 `Notes.sdef` 的 SHA-256 为 `2485c3e87dbfa0baf09fcfa6d2f6b2c16e4eccc1371db01a2ab8c3d35ef4e65d`。字典定义 note.body 为 HTML，另有 plaintext、日期、只读 ID/container/passwordProtected/shared；账户和文件夹有 ID、层级；attachment 有只读 ID、可空 name、contentIdentifier（HTML content-id URL）、URL、日期并支持 native-format save。隐藏 contents 明确不承诺暴露原文件路径。

修正版真实只读读取自然退出0，2.643秒：1账户、7文件夹、126笔记；只读12条元数据、其中6条HTML/纯文本、7个文件夹。12条的修改日期读取前后相等。另取一个含附件笔记，ID、标题、日期、HTML和纯文本读取前后逐项精确相等。该证据只覆盖样本，不是全库内容不变证明。

桥接实测：`Application('Notes').accounts().length` 成功；读取 note.container 要用 `note.container().id()`。原版 `note.container.id()` 得到12次 -1728，已保留，不能当作源文件夹缺失。无需先调用 running() 或 activate。单项 AppleScript count accounts 0.152秒成功，JXA accounts() 0.098秒成功；当前读取自动化授权可用。

附件能力不能只凭字典宣称完整：追加限量扫描20条附件元数据，采样3条含附件笔记，三份都有非空CID，却都不在其HTML中；其中2个attachment.name为null。`app.save(attachment, {in: Path(hostAllocatedPath)})` 均返回 -10000，无目标文件。对第一份另用 AppleScript `save attachment … in POSIX file …` 同样 -10000，故不是仅JXA Path语法问题。这3条读取前后的ID/标题/日期/HTML/纯文本均精确相等。类型尚不能由这些字段断言为图片、表格或云端未下载；须按不可导出对象报告，不伪称无附件。

六份正文样本只有 div/h1/br，未观察到清单或表格。这不是“不支持清单/表格”的证明；真实样本仍未证明这些语义。CID不在HTML时也必须保留附件清单，不能丢弃对象或伪造其原始位置。

## 初始失败及修正边界

首次限量脚本55.005秒超时，缩至单项的脚本15.006秒仍超时，只有自己的osascript子进程被超时结束，未终止Notes。两者采用 `running()` 和未显式调用的 collection.length。之后引擎单测、AppleScript单count、JXA显式accounts()和修正版读取成功。现有证据只能把前两次归为初始脚本超时，不能断言TCC拒绝或特定桥接调用就是唯一原因。未反复请求授权，未更改系统权限。

`evidence/` 只包含安全聚合摘要；原错误和失败均保留。`readonly-probe-template.js` 是脱敏的限量研究脚本模板，输出包含私有内容，调用者必须捕获到私有文件，不能直接在开发控制台执行。它不是完整产品导出器。

## 可交付的来源协议建议

源适配器返回私有 JSON `version:1`，字段：

- accounts：id/name；folders：id/accountId/parentId/name。
- notes：id/folderId/title/html/plainText/createdAtMs/updatedAtMs、状态/有限原因和附件数组。
- attachments：id、可空cid/name/url、host预分配relativeExportPath、状态/有限原因；MIME从导出后文件探测，不信任扩展名。

每一类字段采用明确成功/失败，不把不可读正文伪装空串。先判断 passwordProtected，再读取正文；锁定项跳过且不解锁。账户/文件夹归属由稳定ID匹配，不依赖名称或列表序号。脚本只读取 host 已批准的对象，附件出口由 host 随机安全名分配，不能拼接源附件名或URL。扫描可完整读取元数据，正文/附件工作逐条限时、有进度且可取消；取消仅结束本轮拥有的脚本，不杀Notes。

保存附件后先检查文件确实存在、为普通文件、没有符号链接、尺寸/类型可接受，再复制进目标受管附件目录。不要把源保存命令“无异常”当作文件成功。CID在HTML时按出现顺序重写为新的受管附件ID；缺失CID、非文件特殊对象、URL或保存失败均要在结果展示。正文可用而附件失败时，该笔记最多是部分成功，不能展示完整成功。

目标保留原始HTML和元数据为不执行的独立本地记录，再安全转为现有编辑器schema。原始文件字节不进SQLite。来源去重采用账户/笔记稳定ID的散列与内容指纹；来源同ID内容改变生成新副本，不覆盖用户已编辑目标。先暂存，再通过目标Store事务提交文件夹/笔记/附件/导入映射；成功标记与目标写入一致，失败不记成功。

## 源保持验证

产品真实集成应在导入前后私下记录同一组稳定ID、名称、HTML/纯文本、日期、附件ID/元数据摘要并比较；公开只留相等布尔/数量/哈希。保持原目标笔记、设置和录音状态。系统Notes启动后可能独立后台维护，源SQLite文件mtime不是内容保持的充分或必要证据。当前研究仅提供上述样本保持证据，尚未证明实际产品完整导入。
