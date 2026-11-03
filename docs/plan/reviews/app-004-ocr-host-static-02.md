---
id: app-004-ocr-host-static-02
task: app-004-ocr-host-01
original-baseline: 8bc8ae2f712ebf85ec0cd79453318563e3d83a8b
parent-candidate: 2ad1e89423d1be6e872c248bfcae92ff2abade62
candidate: 5b707ae73f541bb784f08e6af0d1afdae2750c2c
result: source-ready-p2-closed
date: 2026-11-04
---

# OCR 宿主独立源码复审 02

**候选 5b707ae 源码门禁 SOURCE-READY，关闭独审 01 的 P2 预览状态残留阻塞。** 两份原独审失败复现逐字节原样重放均通过，37 项生产 App 闭包/控制器检查、类型和差异检查独立通过，未发现新的已证实阻塞。此结论不是主 App 原生 OCR、真实正文持久 ACK、设备锁定、冷启动或像素验收通过。

全部读取与检查只在 root 新建的 detached 树 `/private/tmp/apple-notes-ocr-host-review02`，HEAD 为完整候选 SHA，父为 2ad1e89。未读开发 WIP、未修改产品或自合并。新证据位于 `docs/verification/app-004-ocr-host-independent-02/`；旧独审 01 的失败报告及原始证据保留，不用本轮成功覆盖历史失败。

## 修复及原失败重放

产品相对父候选确实只改 `src/App.tsx` 与 `src/ocr-host.ts`：

- App 的当前 owner `finishOcr` 在真实终结后清空 React text/error 并隐藏面板，再无残留结果等待下一次 note 失效。`suspend` 与 `detach` 先封住入场、设置 detached，再请求清除 UI 状态；原操作及资源身份继续保留到实际取消/保存终态。
- Host 只在实际取消成功，或正文 ACK 后 acknowledge 清理成功的终态发布空 text/error。正在处理、取消失败、正文未 ACK 或清理待重试仍保持原操作身份；没有删除 pending 文档、改变一次插入事务、绕过正文 ACK 或丢弃清理重试。
- App 的 `finishOcr` 与 `update` 仍核对当前 operation 身份；失效的旧 owner 不能清除或填回后开的有效面板。不相关 note 的失效不清当前 owner。

从本冻结候选保存的原独审脚本副本中取出原始字节，独立与原独审已记录 hash 核对：

| 原独审复现 | 原源码 SHA-256 | 本轮结果 |
| --- | --- | --- |
| 活动 OCR 原目标失效后清 UI | `71d156fb925eb0b150ea765526dee727a90fd2d39d208b728a383369ec7f3042` | exit 0，面板隐藏、会话清理，React 最终 choose/text空/error空 |
| 已完成 OCR 再使原目标失效 | `6db652e37c246c25e2586e25f2d3c760d23bcdb8e51fea0f95cdc2eab3797d7f` | exit 0，正文 ACK/清理成功、owner释放，React 最终 choose/text空/error空 |

没有改断言、等待或脚本内容，也没有必要的路径适配；仅将运行 cwd 指向 review02，使其读取 exact candidate02 生产源码。脚本及独立命令、stdout/stderr 均保存于本轮证据。两条原 exit 1 仍以独审 01 为准，不改写为原先通过。

这项修复清除的是当前状态缓存，不承诺 JavaScript 内存安全擦除；正文、PM 历史、未确认保存文档和仍需核定的资源身份按既有契约保留。

## 定向检查与实际覆盖

| 本轮独立执行 | 结果 | 证据 |
| --- | --- | --- |
| 冻结 `scripts/check-ocr-host.mjs` | 37 项，exit 0 | `ocr-host.stdout.txt`、stderr、command |
| 两份原独审复现原样重放 | 两次 exit 0 | `original-active-repro.*`、`original-completed-repro.*` |
| `tsc --noEmit` | exit 0 | `typecheck.*` |
| 父候选到新候选 `git diff --check` | exit 0 | `diff-check.*` |

37 项保留前 27 项主链路及失败分账检查，新增 10 组沿实际生产 `accessHandler`/`clearSensitive`、OCR lifecycle、唯一 close effect、Host、bridge、SaveQueue、可信同步、SearchEditorGate 和实际 PM/history 执行。独立审查新增夹具与断言后运行原冻结脚本，没有改产品或测试。重点结果：

- recognized/error 预览在原目标 suspend 时先从 React 状态清除；延迟 native cancel 期间原 operation/session 仍可核定，取消终态 Host 结果也清空。
- 实际 prepare→成功 ACK→commit 销毁原 Editor；以及未先 prepare 的 `clearSensitive` 都清预览。处理中的晚 OCR 结果在 prepare/commit/卸载后不插入、不回填 UI，只清原 session。
- 已插入但保存失败时，prepare 的失败 ACK 与 abort 保留完整 pending 正文、原 Editor、同一 operation/session。经实际通用 `retryAttachments`→`saveDoc`→生产 bridge/SaveQueue 的受控成功响应确认正文后，仅一次插入、待保存集合清空、原会话完成清理，预览没有恢复。
- 正文已 ACK 但清理失败时，prepare 后仍保留同一 session。重试只清理，不增加正文保存或 PM 插入；原已保存正文保持。
- 正常 saved/cancelled 终态均清 React 与 Host text/error；卸载的延迟清理不重填。其他 note B 的 suspend/clearSensitive 不影响 note A 的预览。旧 owner 的晚 finish、实际 captured update 与文件回调均不能清除/写入新 owner。

检查不是完整 App mounted 或真实事件传递测试。原生 OCR/权限/选图/相机、数据库响应、FileReader 与 Editor dispatch 宿主为受控边界；PM 事务/history、生产闭包、控制器、guest/bridge、授权/保存队列是真实调用。不能将受控保存成功响应称为 Rust Store 实际持久提交或真实锁定通过。

## 冻结身份、保护边界及旧证据

14 产品文件大小/hash 全匹配，按作者列出的 productFiles 顺序、每条 `sha256 + 两个空格 + path + LF`、UTF-8 编码后 SHA-256，独立复算为 `8ab33c1e95fdc37cf09a624ed81e5b30465800b778fe4e6fba20ad2962e076a1`。12 个产品文件逐字节同父候选；Git 产品路径变化集合严格只有 App/Host 两项。

22 个保护文件分别与原基线和父候选 Git 字节核对相同；17 个 candidate01 作者证据逐项同父候选。另独立核 7 个检查源码的大小/hash及父候选相等标记，只有 OCR 检查脚本新增覆盖，其他保持原样。37 项输出记录的 16 个生产模块 hash 与 exact 树实际字节全部一致。开始与结束 Git status 均为空，HEAD、14 产品、22 保护、旧 17 作者证据和 7 检查源码结束均未变。

Panel/CSS、浏览器检查、工具栏、原生注册、Cargo/lock、模型和引擎均未变，因此按本轮范围没有重复 Panel、metadata、原录音/附件或无关完整矩阵。原独审 01 的 Panel7 DOM 检查与 320px 截图底部未查明画面观察继续按原范围保留；本轮没有将其改为视觉或原版像素通过。原生/依赖接入结论继承独审 01 的源码/解析范围，不新增 native 编译结论。

本轮 manifest 显式记录两种可复算聚合：`aggregateSha256` 按原 manifest files 数组顺序（Python pathlib.Path 分段排序），以及 `canonicalPathStringAggregate.sha256` 按完整相对路径字符串排序。二者每条都为 hash、两个 ASCII 空格、相对路径和 LF，UTF-8 编码；不包含 manifest 自身与另列的外部报告。产品 14 文件聚合使用其声明数组顺序，另行明确记录，避免排序含义混淆。

## 释放与验收限制

本 review 树只临时建立指向主 node_modules 的链接；结束核对精确目标后移除。没有下载、原生构建、GUI、设备、共享 target 或用户数据操作；本轮未启动面板服务/无头浏览器，独立树干净，可由 root 释放。

源码可供 root 按现有主线整合。候选仍不含后来主线的 recording preview；整合时该部分及 App 父边界应另按 root 的计划核对，不能用本候选结果替代合并后检查。真实 App 的 Vision/Android OCR、权限、Rust DB 正文 ACK、Undo/Redo 正常退出冷启、无 GMS、实体相机与像素仍需统一新包独立实测。完整文稿、多页 PDF、扫描集合长期存储及复裁仍为后续任务，本轮不关闭 APP-004。
