# 智能文件夹置顶条件恢复16独立复核

**结论：pass，仅源码适配、隔离生产组件交互和相关校验回归。** 没有确认的 P1/P2/P3 blocking 或 non-blocking finding。原P1问题在本次源码条件下不再复现；准确新包、实际保存及正常/冷进程重启仍须由root验收，不能沿用旧Android05包宣称已修复。

契约见 `docs/plan/tasks/app-smart-draft-hydration16.md`。作者基线标识为 `80b01da97db32904b38bea915b61812f5d486528`；本轮按root封存的源码SHA审查，未使用Git。审查期间root通知docs-only提交推进到800145e，不构成此处产品来源的新声明；开始和结束逐项源字节核对为准。

## 源码与范围

唯一相对已审geometry15完整输入的产品变化为 `src/smart-draft.ts`，SHA-256 `a97480a10d85fcb50091987af187d0132608528349748f6488715988004abca6`。与作者基线副本的逐字diff仅增加第41行：

```ts
...(r.type === "pinned" ? { pinned: r.value } : {}),
```

该映射位于默认草稿及持久规则spread之后，显式false会覆盖 `newTagRule` 的true默认值；没有布尔强制转换、truthiness筛除或兜底true。既有持久schema仍使用 `value`，草稿控件和 `draftQuery` 仍使用 `pinned`。只改名称提交现在从同一持久布尔值往返。没有改变规则语义、Rust查询/存储、保存处理或错误路径。

标签names仍复制数组，id、expectedDefinitionRevision和combine仍按原路径保留。已审geometry15的 `SmartFolderForm.tsx`、`smart-folders.css` SHA分别保持 `41fd3e76ed7d8b53890f51160226871126a0295a9df7be1bed2bf1281746f299` 和 `2174301b19a3d4dbcf709ed52d8a76b766be870ffccd32fad9c5a1adb3419a53`。相对geometry15独审保存的320项实际输入，恰好只有smart-draft一条变化；七份构建工具不变。没有扩大到平台UI或工具。

## 保留原失败与独立反例

作者baseline文件SHA为 `7cf895cc26f8113a2017b08a89a14d91acb2af299385ef454ff2aee70074e5ac`。原 `before-attempt01` 的实际源码hash与此相符，280项断言中70失败，状态fail；之后280项全通过。两端原false截图、原失败JSON、最终作者记录及manifest均按实际字节冻结，结束未变。

reviewer另在隔离Vite模块中加载这份真实基线adapter，仅读取它，映射其相同的生产依赖，不替换或改写工作区产品。对同一个持久false定义，基线adapter加生产 `draftQuery` 得到 `value:true`，当前adapter得到原 `value:false`。独立反例确认检查确实可区别修复前后，没有以期望常量代替生产adapter。

root设备记录的文件名不作为成功证据。本轮没有读取活动设备目录或接触设备、数据库；实际冷启动门槛仍留给root。

## 生产adapter和两端组件回归

证据目录 `docs/verification/app-smart-draft-hydration16-independent/`。`check-independent.mjs` 复用作者的实际生产adapter/React组件夹具并增加独立边界，首次运行exit0，约7.6秒，外层上限90秒。使用已有Chrome和依赖，单独headless profile、本机127.0.0.1页面、仅本次独立目录的Vite缓存；没有App bridge、Session/Store、后端或数据库。保存/冲突为内存回调，onRefresh明确拒绝。

最终20个真值场景、16个真实表单场景、6个新增独立场景，共329项断言，0失败、page error和外部网络请求均为0：

- 20例覆盖false/true、仅置顶或四种标签模式、all/any；生产draft→query往返相同，id/revision/combine保留，修改草稿names不回写输入。16种事实中的生产成员结果与原查询一致。
- 16个实际desktop/mobile场景覆盖false/true、仅置顶/混合标签、all/any。读取实际置顶与组合控件；从新挂载仅改名提交，回调查询完全等于原查询，id/revision保留；以模拟保存定义重挂载仍显示相同布尔值。取消不调用保存、不改输入；移动过滤面板修改后取消再开、原样确认也保持原值。
- 新增一组真实基线false反例，三项检查通过。
- 新增14项严格拒绝检查：非布尔置顶值（字符串、数值、null、对象、数组）、非字符串combine、空已选标签、未支持日期和重复置顶规则，均由生产adapter/query路径拒绝，错误代码仍为 `smart_invalid`。没有放宽既有校验。
- 新增desktop/mobile×false/true四个保存冲突重试场景。第一次真实点击提交由回调模拟 `smart_conflict`，实际组件显示错误并保留可编辑名称；原查询、id/revision不变。第二次点击重试收到同一查询和版本，两次尝试零取消，输入定义不变。没有把客户端版本传递检查表述成服务端CAS执行证明。

独立手机截图目视确认置顶为“不包含”，DOM值也精确为false。它是受控生产组件，不是Android原生包截图。模拟重挂载只能证明草稿重新恢复路径，不能证明真实正常/冷进程重启或持久化。

## 收口与限制

开始固定的19项作者证据/geometry15封存记录/规范工具和320项当前输入在结束逐项重算未变；作者前后证据、baseline和本次产品SHA都相符。`input-initial.json`/`input-final.json` 保存核对，`attempt01/result.json` 保存逐项断言，`result.json` 与 `evidence-index.json` 保存有限结论与文件身份。没有失败重试或隐藏失败。

作者已有typecheck及30项生产契约记录通过；本轮以本次相关生产组件/adapter检查为必要验证，未重复更广测试。未修改产品、工具、schema、Rust、查询匹配、媒体、用户数据或作者证据；未运行平台构建、Git、GUI/ADB、下载或共享target/cache操作。独立自有缓存已停止并保留，未清理共享缓存。未stage/commit。

准确新Mac/Android包、实际保存后重新打开、正常和冷重启均须后续有限验收；移动错误反馈、文字误选、完整智能规则及总体像素目标继续open。**SOURCE-REVIEW PASS / STOP；共享target/cache未获取或使用，已释放。**
