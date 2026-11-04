# Task16 — persisted pinned false draft hydration

状态：**SOURCE-READY STOP，等待不同作者独审**。2026-11-05作者受控检查通过；未构建、安装或运行新平台包。此目录不代表设备冷启动验收，也不改变smart-U/device09总体open状态。

## 范围和修复

基线HEAD：`80b01da97db32904b38bea915b61812f5d486528`。唯一产品修改是`src/smart-draft.ts`中`folderDraft`增加显式映射：持久化`PinnedRule.value`写入草稿`pinned`。显式false不再被`newTagRule`的true默认值覆盖；原有规则对象、标签names克隆、combine、id及expectedDefinitionRevision处理保持。

`src/SmartFolderForm.tsx`和`src/smart-folders.css`的SHA256仍与已提交geometry15一致，详见`source-manifest.json`。没有schema、Rust、查询匹配、存储、媒体或构建工具修改。

## 保留的原失败

`baseline-smart-draft.ts`保存修复前源码。`before-attempt01/result.json`来自修改前实际生产adapter及React组件，20个规则场景+16个表单场景共280断言中70失败，进程exit1。false在两端重开显示包含，只改名称的实际onSave回调得到`value:true`，复现了隐式改写；true回归路径和取消不提交等检查通过。`before-attempt01/*-persisted-false.png`保留两端错误截图。

原设备观察属于root的`../android-smart-u-runtime09/`；其`36-cold-persisted-exclude.png`图像实际显示“包含”，是错误回填证据，不能称为已通过。此处没有读写设备或数据库。

## 作者验证

| 检查 | 修复前 | 修复后 |
| --- | --- | --- |
| 生产adapter真值表20例 | false映射/往返/成员集合失败 | 全通过 |
| 生产React两端表单16例 | false显示及只改名提交失败 | 全通过 |
| 总断言280项 | 70失败 | 0失败 |
| `pnpm typecheck` | 本次未运行 | exit0 |
| `node scripts/check-smart-contract.mjs` | 本次未运行 | 既有30例通过、exit0 |

真值表覆盖true/false×仅置顶及标签混合（allSelected/anySelected/anyTag/noTags）×all/any；验证query往返、id/revision/combine保留、names修改不回写输入，以及16种事实（置顶true/false、标签unknown/empty/partial/all、eligible true/false）的成员结果不变。

16个真实表单场景覆盖desktop/mobile×true/false×仅置顶/混合标签×all/any。经实际DOM读取重开选项，通过真实名称输入与提交按钮执行只改名保存，检查onSave收到的完整草稿和生产draftQuery结果，再以保存结果重新挂载组件验证重开。检查取消不提交和输入定义不变；移动端另检查修改置顶/标签后取消过滤面板、重新打开，以及确认原样过滤面板。移动只改名称保存从新挂载开始，不需打开过滤面板，覆盖潜在静默改写。

`after-attempt01/result.json`记录修复后全部结果。两端`*-persisted-false.png`经作者查看，均显示“不包含”。页面错误及外部网络请求均为0。

## 重跑方式与隔离

使用已有依赖与已有Chrome，无下载。每次传一个不存在的独占输出目录：

```sh
PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node docs/verification/app-smart-draft-hydration16/check-hydration.mjs docs/verification/app-smart-draft-hydration16/reviewer-attempt01
```

fixture导入实际`SmartFolderForm.tsx`、`smart-draft.ts`及完整生产CSS；隔离回调只在内存记录草稿，onRefresh明确拒绝。Vite仅绑定127.0.0.1、缓存仅写入本次输出目录，浏览器拒绝外部请求。finally关闭browser、HTTP server和Vite；本次两个临时vite-cache已清理，其它证据保留。没有App bridge、后端、Session/Store、持久数据库、共享target/cache、原生GUI、ADB或Git mutation。

这里只证明源代码适配与实际React交互；模拟重新挂载不等于正常/冷进程重启或设备持久化验证。独审后仍需root固定准确新包并验证两端正常/冷重启及实际保存，不能沿用Android05包宣称修复。移动错误反馈和context文字误选仍为独立工作。
