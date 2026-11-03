# APP-002 Mac 图片 / PDF 旧冻结包真实基线 01

2026-11-03，verify 独占 Mac，使用同一冻结 `/private/tmp/notes-search-scroll-56d7e05.app`，可执行文件 15,534,976 bytes，SHA-256 `56d7e059437690fa000a1e69a01fee24f1595eed69e9acf287c694098a2eff9a`。仅做图片及 PDF 各一次明确系统选择 → 打开后的有限结果，不修改实现或安装候选，不操作原版 Notes、Android 或私人笔记。

## 结论

**本包的这次本地附件闭环未通过。** 图片明确选中并点击系统 Open 后显示“备忘录或授权状态已改变，请重新执行操作”，没有插入节点，该 note 的附件表仍为 0。PDF 从新鲜菜单上下文选中并点击系统 Open 后显示同样错误，但 Rust 已保存完整 PDF 文件及附件元数据，正文没有引用该附件；真实退出、移开临时来源并同包冷启动后，孤儿附件仍存在，完整 note 与导入前相同。

| 路径 | 本次实际达到 | 未达到 |
| --- | --- | --- |
| PNG，22,972 bytes | 原生“选取照片或视频…” → 系统选择受控文件 → 点击 Open → 实际错误；完整正文未变、附件记录 0 | 未得到受管 PNG、正文节点或图片预览，不能验收冷启图片显示 |
| PDF，30,956 bytes | 原生“附加文件…” → 系统选择受控文件 → 点击 Open → 实际错误；已有字节完全相同的受管 PDF 及附件表记录；冷启动后仍持久 | 正文无附件节点，无法从正文打开/预览；孤儿补偿未生效，闭环 fail |

本轮没有通过 DOM、桥接写入或直接数据库写入制造附件，也没有以文件名卡片、read API 成功或磁盘文件存在声称实际预览通过。没有继续追更多重试/矩阵以取得 pass。

## 受控数据与来源移动

新建合成 note `QA MEDIA 56D7 20261103 2232`，id `2df8f45b-2c30-467e-b389-e36065e9ca52`，位于“QA 独立验证”，revision 69。正文为一个标题、合成英文说明及空段落，完整 document/note 保存在存储快照中；未改动既有用户内容。

为避免使用无法确认的外部源，本轮自生成 640×480 测试图：标题、红黄绿蓝 1–4 色块、HEAD / END56D7 标记；PDF 是该图的一页栅格 PDF。原件保存在证据目录 `fixtures/`，曾用 view_image 确认内容为合成图。

| 文件 | SHA-256 |
| --- | --- |
| `QA56D7-controlled.png` | `a8dad607687ed803daf7979ee48ccc312c3207f02b04ba934b7f2407a1d5a417` |
| `QA56D7-controlled.pdf` | `288ca922ac0e452e20e71428a5fb1c34233acb66eb5ec1cb83dc77871153eeeb` |

仅将原件复制到 `/private/tmp/notes-media-baseline-56d7/source/` 供系统文件框选择。两次明确选择结果冻结后，将这个本轮生成的 `source` 目录 rename 为同级 `moved-source`；两个原选择路径均已不存在，held 副本与证据原件哈希仍相等。没有移动、删除原 fixture 或产品受管文件。

## 实际证据与冷启动

证据根目录：`docs/verification/app-002-media/mac-attachment-baseline-56d7-01/`。

- 决定性的 PNG 系统选择状态为 `07-system-image-selected.ax.txt/.png`，明确 selected 行指向本次临时 PNG、Open 可用；`08-image-import-return` 是实际错误。`05-before-success-storage.json` 与 `09-after-image-error-storage.json` 对比：完整 document 相等、revision 69、该 note 附件 0。
- `11-system-pdf-selected` 明确 selected 临时 PDF；`12-pdf-import-return` 为实际错误。`13-after-pdf-error-storage.json` 显示附件 id `754a70e3-7590-44be-8bd6-0da9501279f0`、kind file、MIME application/pdf、size 30956；受管路径 `/Users/water/Library/Application Support/com.local.notesclone/attachments/754a70e3-7590-44be-8bd6-0da9501279f0.pdf`。`16-managed-attachment-after-error.json` 独立读字节哈希严格等于 PDF master，附件 id 未出现在完整 document 中。
- 临时来源移动后，真实 Command+Q；CUA 返回 App quit，原 PID 5962 的 `ps` 为空、exit 1，collector 无 clone。再显式打开同一包，collector 新 PID 7041，`23-cold-process.txt` 核对精确可执行路径；这次是进程不存在后的冷启动。
- 冷启动自动恢复合成 note，`19-cold-note.ax.txt/.png` 没有附件。`20-cold-storage.json` 和 `21-cold-comparison.json` 核对：**整个 note（含完整 document）、revision、附件元数据均与相应保存值相等，PDF 文件字节仍等于 master，正文仍不引用该 id，两原来源路径仍不存在**。不能将此核对解释为附件 UI 冷启预览通过。
- 最后再次真实 Command+Q，PID 7041 `ps` 空、exit 1，collector 无 clone，Mac GUI 明确释放。未取得被测进程自身退出状态，不声称 exit 0。

数据库只通过 `mode=ro` 连接，只按本次新合成 note 的 id/title 读取，未直接修改数据。文件只对本次已知附件路径读字节；未扫描或清理全部附件目录，因此不声称全库无其他孤儿。该 note 和 PDF 孤儿按 root 要求保留，供后续归因。

## 操作干扰与归因限制

首次路径定位预备操作曾遇 CUA “user changed app”，重读后系统框已关闭、视图变为列表并打开既有合成 QA Checklist；未继续使用旧索引，没有在该 note 写入。第二次出现同类 guard 时先保存 `10-interruption-state` 再重读；仍是本次新 note 的错误界面。没有把这些不确定预备动作当成附件导入成功或产品失败的独立复现。

为取得可确认的系统选择，随后通过原生 GoToWindow 的 AX 可设路径栏设置本次目录，再双击系统路径候选、单击真实文件行并点击 Open；这属于系统文件选择 UI，没有设置 HTML file input/注入文件。`03-image-file-selected` 实际只是早期定位返回后的无附件主窗口，名字不代表选中；决定性选中证据以 `07`、`11` 为准。

**没有精确捕获抛错栈或 IPC 返回点，不能认定必然是第二次 `nativeAssert` 抛错。** 源码路径有 store 前 guard、`storeAttachment` 内调用/accept、store 后 guard 等边界；PDF 落盘证明已执行 store，但 bridge accept 在 store 后拒绝等可能性仍未区分。报告仅认定实际错误文本、字节/元数据与正文不一致及冷启动持久孤儿。root/native 后续只读归因与开发最小修复另行记录，本轮不混入修改。

本轮未覆盖视频、分享/导出副本、权限拒绝、全部附件失败类型或像素比较，录音/纸张候选仍保持各自门槛。报告、完整快照及 manifest 交 root 统一保存；verify 未执行主工作树 git add/commit。
