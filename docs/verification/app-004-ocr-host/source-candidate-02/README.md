# OCR 主App文字接入源码候选 02

状态：开发修复冻结候选，待独立复审。父候选为 `2ad1e89423d1be6e872c248bfcae92ff2abade62`；仍在原 `task/app-004-ocr-host-01` / `/private/tmp/apple-notes-ocr-host-01` 分支与树向前修复，没有rebase、主合并或改独审树。原基线仍为 `8bc8ae2f712ebf85ec0cd79453318563e3d83a8b`。

## P2及窄修

完整独审见主文档 `docs/plan/reviews/app-004-ocr-host-static-01.md`。候选01在活动原目标失效后，以及保存完成/operation释放后，React ocrState仍保留识别明文；面板隐藏和原生会话删除不等于清除预览状态。此为已证实的内存状态残留，未据此声称可见泄漏或任意内存读取。

本次产品仅改两文件：

- App在suspend/detach先封住operation回调，再同步清React预览text/error并隐藏Panel。正常finish也清状态并释放owner，覆盖已完成操作不再有owner可供后续suspend匹配的情形。
- OcrHost仅在实际cancel或ACK后的acknowledge清理成功终止时，将自身state.text/error清空。正在取消/清理失败、未ACK正文仍持有原操作资源身份。未ACK正文没有删除或重插，prepare失败→abort仍可经现有通用保存队列重试，ACK后清理失败仍仅重试原session。

这是清除当前状态缓存，不是JS内存安全擦除承诺；插入正文/PM历史、未ACK pending文档和原资源恢复身份仍遵循原契约。没有修改Panel、CSS、native-toolbar、原生引擎/模型、Cargo或权限/签名。清UI与正文保存/原操作恢复分开记账。

## 检查

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 原27 + 新10组实际App闭包检查 | 37项，exit0 | `ocr-host.json` |
| 独审活动失效repro原样重跑 | 修复前exit1、修复后exit0 | `independent-repro-before.txt` / `independent-repro-after.txt` |
| 独审完成失效repro原样重跑 | 原独审exit1、修复后exit0 | `review01-ocr-sensitive-state-completed-repro.stdout.txt`及stderr / `independent-completed-repro-after.txt` |
| 原样Panel浏览器检查 | 7项，exit0 | `panel-result.json`、geometry及两张PNG |
| 原录音父接线 | 20项，exit0 | `recording-submit.json` |
| 原附件提交 / 取消 | 23 / 8项，exit0 | 两份对应JSON |
| 前端typecheck / build | exit0 / exit0 | `typecheck.json`、`frontend-build.json`，原始stdout按JSON字符串无损保存，既有chunk警告保留 |

新增10组使用实际生产App的ocrLifecycle/finish、accessHandler/clearSensitive、唯一close effect闭包，生产Host/bridge/SaveQueue/可信同步/PM及SearchEditorGate。覆盖：正常saved/cancelled终止；带错误的识别预览与延迟取消；prepare→commit；不经prepare的clearSensitive；未ACK保存失败→prepare失败ACK→abort→同正文通用重试；已ACK清理失败→prepare→只重试清理；prepare/commit/unmount时识别晚返回；已识别状态卸载的延迟清理；不相关noteB的suspend/clearSensitive保留当前noteA预览；旧operation晚finish/原captured update/选图回调不能清除或填入新owner。平台OCR/DB/事件传递与Editor宿主仍受控，没有挂载完整App或真实锁定/设备流程。

两份独审repro源码逐字节复制在本目录，来源/hash/命令见 `repro-provenance.json`；只是原样执行，未为通过修改断言。活动repro修复前在原候选实跑的完整combined输出保留；完成repro的原独审stdout/stderr复制保留，并明确与本次after运行分开，没有将原失败改成通过。

Panel脚本及组件/CSS均与候选01同hash。本次7项DOM几何、键盘、字面文本检查通过，pageErrors/externalRequests为空。本次实际查看320图；原独审报告的底部截断/重复画面观察仍未查明，不归因为产品/浏览器、不改CSS，也不宣布视觉通过或原版像素一致。

## 身份和旧证据保全

14产品文件聚合SHA256：`8ab33c1e95fdc37cf09a624ed81e5b30465800b778fe4e6fba20ad2962e076a1`。`source-manifest.json`列逐文件大小/hash、仅App与Host两处产品差异、22个原保护边界与17个candidate01证据文件逐字节同父候选的核对结果。`check-source-manifest.json`列检查源码身份，只有OCR检查脚本增加生产授权闭包与新回归，其余检查不变。

旧候选01证据17文件未改；独审01的原58项证据与报告均没有修改。Cargo与原生注册文件保持candidate01字节，因此未重复已独立通过的metadata或无关完整矩阵。没有native构建、共享target、GUI/设备/权限操作或下载。本工作树自建依赖symlink在冻结前核对目标后移除，无头浏览器/Vite/server由原脚本finally关闭。

交root创建独立review树，不自合并。真实主App Vision/Android OCR、相机、Rust DB ACK、UndoRedo/正常退出冷启、无GMS与原版像素仍需新包实测。完整文稿/PDF/长期扫描集合仍在后续范围。
