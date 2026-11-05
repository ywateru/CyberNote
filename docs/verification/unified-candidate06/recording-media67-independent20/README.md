# Mac20 media67 独立只读核验

结论：**PASS（冻结输入、来源与包身份）**。本目录仅为独立读取证据，不代表实际应用运行、录音持久保存、音轨质量、WebKit或像素验收通过。本轮没有编译、新功能测试、签名、启动应用、GUI/设备/进程/权限操作，也没有读取、复制、导出或转写任何真实音频。

## 精确来源

- 构建源 `b455c14093b7a717a0a6e810b30d19301296e448`；冻结核对和核包首尾均观察到此HEAD，没有修改提交或冻结输入。
- 已独审作者产品 `7243c649862181d35aa94063149e30653593d7dc`；271项独立受控测试源码绑定与本次构建源一致。此前30组独立候选接受和1组旧hook缺陷对照保持各自范围，本轮没有重跑。
- 冻结文件 `../mac-recording-media-build20/input-freeze.json`：**350994 bytes**，SHA-256 `051ad9000605d9883596090dec6618d1121d99f24379b138c145771e3df97da2`。
- 九字段授权 `../recording-media67-preparation/mac-authorization.json`：39568 bytes，SHA-256 `2d5f283789f9975230e34d54538ae17b5218e3ab31c523c41718b002ad77bd6c`，与冻结文件内容一致。
- 产品361项，完整输入382项；产品aggregate `c12780c3f0049592fa035e6c64f39a3d9df40b054249ee7194abc49a205f4c3d`；输入aggregate `7ba3010f9b9fdc0f2f72aebc391d0a4bcdbf9f45575b6396e70a04cfe63ddf00`。

## 冻结核验

`audit-freeze.py` 逐项独立核对当前文件bytes/SHA、Git源对象及完整集合重建。361项产品均受Git跟踪；全部Mac19产品/输入保留，21项历史input-only的内容保持。精确新增仅三份67检查脚本，既有输入唯一修改为 `src/use-attachment-media.ts`，其字节与已独审7243相同。两个历史删除的子窗口capability继续缺席。

77项插件文件完整捕获。全部三份capability字节与Mac19一致；原main/note-* `notes-ui:allow-recording-access` 保持。两组完整application handler注册块、7项录音命令、native handler/guard源保持，11处invoke起始行与15处guard函数位置符合当前源；14项插件权限/桥资源与旧源相同。没有增加或删除权限、原生命令、录音写入、存储或退出守卫。

7份构建工具字节、冻结的5项成功工具版本观察、offline/jobs2环境、2项overlay、701项Gradle分发内容及完成标记、缓存AAR中25项OCR模型均核对通过。工具版本只核原冻结观察，没有重新执行。该身份检查不证明完整OS/SDK/传递依赖可复现。

冻结审计首轮适配器把记录的invoke起始行误当作命令字符串必须同一行，遇原有多行 `invoke<RecordingIdentity>(` 停止。原脚本及stdout/stderr保留为attempt01；修正只读匹配为准确起始行及其后两行后完整PASS，没有产品问题或产品修改。

## 唯一构建与输出隔离

唯一 `mac-attempt01` 的 `pnpm mac:build` 记录exit0，nonce `b7c6588680fb48f3be9321ccdc1050a7`，耗时45.388秒；记录的拥有进程组已停止且无剩余成员。本审计不重新查询进程。

成功构建前后和收集前后的四份输入快照，除时间外所有字段均等于冻结文件。构建与收集的源、freeze SHA、aggregate、nonce及build-result文件身份完全一致；收集ready=true且所有inputComparisons成功。

开始构建前旧app与dist经原子重命名隔离，固定输出路径当时不存在。独立核对prior文件内容/哈希/模式、目录模式和根inode/device均等于原隔离快照。prior app完整文件清单还与已独审Mac19原始包一致；prior dist此前已由root前端build67产生，独立按其实际快照保留，不冒称为Mac19前端。新app二进制身份与prior不同，生成app/dist完整文件清单与构建记录吻合，收集original又与准确新app逐字节一致。

## 应用与归档身份

目录 `artifacts/unified-candidate06/mac-recording-media-build20/mac-attempt01/`。

| 文件 | bytes | SHA-256 |
|---|---:|---|
| mac-original.zip | 5078654 | `410b2441ad73e6d98223a7fa4e4779b343b2a01684867e50a6610ece779c26ca` |
| mac-sealed.zip | 5003851 | `443826ce3621713b97c5e8c1235ccd022bfca167576f18ff9178b8904dab570c` |
| original executable | 16804912 | `53d4640784454514c23cb832f553844650aa000f7d7be9a6d05e6796c891678e` |
| sealed executable | 16725344 | `00ab5983c7c6c17fb30b66c6e97b27e369b518ebc37221f58e527e0cce8b6dd8` |

original应用完整树2个文件、sealed完整树3个文件逐项对齐收集清单；两ZIP全部6/9个文件条目核查，无重复条目，应用外额外项仅为允许的 `__MACOSX/` 元数据。13份collector命令日志逐字等于其结果stdout，全部记录的命令进程组已结束；只记录一次对派生sealed副本的ad-hoc签名，本审计不签名。

封装差异仅限executable签名相关部分及新增 `Contents/_CodeSignature/CodeResources`；37个Mach-O section名称、长度、zero-fill属性和实际内容hash完全相同。原始与sealed应用、ZIP在独立核包前后身份均不变；382项冻结输入也再次核对未变。

8项独立只读codesign结果及stdout/stderr分别保留：original display/entitlements/requirements均exit0，original strict exit1准确复现 `code has no resources but signature indicates they must be present`；sealed display/entitlements/requirements/strict均exit0。sealed Identifier `com.local.notesclone`，Signature ad-hoc，CDHash **`d46c271b9dac5252ef45010da6bfde60488b866a`**，TeamIdentifier未设置。只接受本地ad-hoc严格核验，不声称Developer ID或公证。

## 结论边界与证据

Mac19的C首次MediaView加载失败保持真实历史；E正常首显与F有限视觉恢复不覆盖C。Mac20实际首显、活动×、主窗close/重开/退出和像素由root另行Computer Use验收，本报告不先行授予通过。旧Mac18进程此前已不在，退出原因/时点未知，不再声称内存音频保全或恢复；Android未操作。

`freeze-readonly-result.json` 与 `package-readonly-result.json` 保存完整结果，后者包含上游记录身份、归档条目、37个section和8项只读签名命令。`prior-application-cross-reference.json` 记录旧磁盘输出的交叉身份。`evidence-index.json` 为本目录全部文件（除索引自身）记录bytes与SHA-256。所有历史失败记录均保持原样，产品、缓存、构建/封装原件与旧应用状态均未被本审计修改。
