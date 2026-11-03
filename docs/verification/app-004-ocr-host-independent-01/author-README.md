# OCR 主App文字接入源码候选 01

状态：开发冻结候选，待独立review。基线 `8bc8ae2f712ebf85ec0cd79453318563e3d83a8b`，分支 `task/app-004-ocr-host-01`，工作树 `/private/tmp/apple-notes-ocr-host-01`。这份报告没有将主App原生OCR、相机、持久冷启或原版像素标为通过。

## 最终行为与代码归属

主Cargo path插件/Builder/capability连接现有notes-scan。Mac typed命令 `recognizeImageText` 明确标为“从图片识别文本…”，原不可用连续互通项仍禁用。Android扫描文本入口使用现成picker或文字camera，camera返回ready不再finish。Mac只有用户已选非空、图像MIME且≤20MiB的File进入一次受限ingest；没有路径输入、永久图片附件或扫描schema。

`OcrHost`固定原note/operation/session，`ocr-native`直接调原typed guest，`OcrPanel`显示实际文字及独立空/失败/保存/清理状态。App在打开前捕获既有PickerTarget并复用TrustedSynchronization；确认时原选区普通段落一次事务，换行/空行和文字字面值保持。重复确认复用Promise；仅真实saveDoc回调的原note/完整文档相等才ACK，随后清理插件会话。保存失败同文档重试，ACK后清理失败只重试清理。旧File回调绑定原owner，不能把晚返回交新目标。

取消先同步封住入场，等待已发原生操作与确认终态；插入但未ACK保留正文及结果，不能删除待保存内容。原唯一close监听在首次await前封住录音和OCR，访问prepare/目标变化/卸载也封住晚结果。共享授权和普通附件验证没有放宽：只有本操作的实际pending文档及Editor正文完全等于插入结果，才允许略过泛化flush失败后沿原可信身份边界重试自己的保存。

工程预览未出现在用户参考录屏，规格见 `docs/ui/ocr-text.md`；截图仅证明当前组件布局和控件可达，不证明原版像素一致。

## 检查结果与准确范围

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 生产App闭包/控制器/guest/bridge/SaveQueue/实际PM | 27项通过 | `ocr-host.json` |
| 实际挂载工程OcrPanel，Chrome156 | 7项通过 | `panel-result.json`、两张PNG和`panel-geometry.json` |
| 原录音父接线 | 20项通过 | `recording-submit.json`；仅夹具加入无活动OCR refs |
| 原生工具栏状态 | 13项通过 | `native-toolbar.json`，原12项加本地OCR命令及禁用项检查 |
| 原附件提交/取消 | 23+8项通过 | `attachment-submission.json`、`attachment-cancellation.json` |
| 实际Editor schema跨检 | 65文档case通过 | `editor-schema-result.json`、`editor-schema-output.txt` |
| 前端类型/生产构建 | exit0/exit0 | `frontend-build.json`；既有大chunk警告保留 |
| 主Cargo offline locked metadata | Mac/Android目标各exit0 | `cargo-metadata-locks.json`，仅解析不编译 |
| scan独立Mac offline metadata | exit0 | 同上，仅解析不编译 |

27项使用实际App AST闭包、生产控制器、guest和adapter/invoke边界、实际AccessGate/TrustedSynchronization/SaveQueue及PM事务/history；原生OCR/权限/DB/FileReader/Editor宿主为受控响应，没有挂载完整App。7项使用实际挂载OcrPanel与受控props/callback、合成File，不触设备。覆盖原目标/授权失效、空/失败/取消、重复确认、同操作保存重试、错误ACK、清理失败分账、UndoRedo、dispatch变更后throw、处理中取消与关闭等；不能替代真实Rust Store/相机或原生OCR。

320×568几何实测：面板x20、y36.203125、right300、bottom531.796875，文字实际可滚动；两按钮44px高、66px宽、bottom507.796875。已目视检查两张截图，文字换行、字面HTML、状态和操作可见。

## 身份与依赖

`source-manifest.json`列出14个产品文件的大小、SHA256及聚合身份 `50232142de0ca96d6ec4786eccde73232aff54b17196c781448587b96d3161ab`；另列原样边界及基线hash。OCR原生引擎/Android生产源码/guest、Editor/schema、types/bridge/SaveQueue、附件归属及提交控制器、录音和共享播放不在本项修改范围。

主lock仅增加notes-scan path包和主依赖。唯一获准依赖兼容例外：scan的tauri-plugin build-dependency精确2.6.3→主线已有2.7.2，其独立lock只对应version/checksum变化。runtime tauri2.12.5、插件0.1.0与模型保持，没有下载。精确package差异见 `cargo-metadata-locks.json`；没有原生构建、共享target使用、设备/麦克风操作或可见GUI占用。

## 首次失败保留与交接

`attempt-history.json`明确标注此前工具结果的转录：首次panel检查仅等待phase，在同recognized新文本尚未提交时误测scroll；修复仅harness新增每次render版本并等待DOM提交，断言和产品CSS未改，7项重跑通过。最初主Cargo精确build版本冲突及未过滤的offline metadata尝试外平台未缓存atk失败也保留；没有将失败输出改成通过。

冻结后移除本工作树自建依赖链接，停止本检查自己的本地服务/无头浏览器；没有删除其他agent的证据或依赖链接。交root建立独立review树，独审通过后再主整合；原生构建/真实Vision与Android OCR、正文ACK/UndoRedo/正常退出冷启及原版像素仍需新包分项实测。完整文稿、多页PDF、长期扫描资源/复裁不属首批。
