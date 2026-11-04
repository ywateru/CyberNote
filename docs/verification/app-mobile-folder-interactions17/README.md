# Mobile folder interactions17 — author evidence

2026-11-05 **SOURCE-READY STOP；等待不同作者独立审查**。基线HEAD `9d46dd6a2c2210dc7c31f98db02c7c189efd0a8f`。没有平台构建、安装、GUI、ADB、后端、DB、共享target/cache、下载或Git mutation。

## Minimal product change

- `SmartFolderForm.tsx`：移动端原操作栏和唯一errorView包在同一容器，errorView从末尾移到操作栏下；原验证、保存、取消、CAS、过滤器状态处理均未改。
- `smart-folders.css`：仅错误态容器sticky于表单滚动视口顶部，背景挡住其后的内容；flow-root包含alert外边距。有错误时提示与取消/确认一起可见，无错误时没有额外占位或sticky行为。
- `style.css`：仅`.folder-row`增加标准和WebKit的`user-select:none`。没有改触摸事件、touch-action、body或编辑器选择规则。

`App.tsx`及`smart-draft.ts`未变；hydration16适配器SHA仍为`a97480a10d85fcb50091987af187d0132608528349748f6488715988004abca6`。geometry15普通Mac样式段未动，普通表单实际几何前后均为400×207.5 CSS px（Chromium边框取整），位置相同；这不是原生WK/新包像素验收。

## Checks and original failures

最终相同夹具、独立输出目录：

| 输入/证据 | 结果 |
| --- | --- |
| `before-attempt03/result.json`，加载归档修复前生产源 | 71项中15项失败，exit1；长面板错误不可见、滚动后控制不可见、窄屏名字页错误不可见、目录选择样式auto |
| `after-attempt02/result.json`，当前生产源 | 71项全通过、exit0；页面错误0、外部请求0 |
| 正常手机三视口及普通Mac几何 | 前后JSON精确相同，见`comparison.json` |
| `pnpm typecheck` | exit0 |
| `git diff --check --`本任务三个产品路径与任务文件 | exit0；早先全树检查发现的公共plan末尾空行已由root修正，作者未改该文件 |

实际生产表单使用32个标签形成长列表，覆盖390×844、390×360及280×240 CSS视口。通过真实确认按钮拒绝空标签后检查唯一alert完整边界在表单及视口内、操作栏按钮中心可命中；滚动到长列表中段后检查现存错误与按钮仍可见，再次确认仍拒绝且无onSave。选择合法标签后确认回上层、不持久化，再保存仅提交选中标签。非法面板取消保留名称、清除错误，外层取消不提交。有效已有规则下清空名字后保存，错误可见且没有onSave。

目录夹具从`App.tsx` AST提取真实`folderRow`、`startLong`、`stopLong`和`menu-scrim`JSX，原文保存在每次输出的`production-folder-fragments.json`。实际触发点击和contextmenu，校验正确目录ID；真实520ms timer由touchstart启动，touchmove/早期touchend取消；真实scrim onClick关闭菜单。选择样式检查目录button及span/svg继承none，body仍auto，生产`.tiptap`样式及其段落仍text；内容可编辑正文样本经用户双击可选字。未改App菜单事件链，完整App源指纹前后相同。

受控chooseFolder只记录导航，menu弹出内容只呈现目标ID，正文为生产CSS下的contenteditable样本；没有挂完整App/Editor或桥接后端。Chromium中目录按钮双击原本也未选中，不能将该项当原Android系统长按故障已验收。这里证明选择规则及真实事件片段可用；系统选择把手、原生触摸/滚动/菜单行为由root后续准确包设备检查。

原始尝试没有覆盖：`before-attempt01`为夹具JSX缺闭括号导致的编译/超时错误，不是产品失败；`before-attempt02`保留实际修复前截图及65项检查，其中9项产品失败，另1项“普通点击”计数受前面双击影响，后已清零修正。`after-attempt01`为修正后65项通过。最终before03/after02额外记录滚动中反馈边界，并用同一夹具重跑归档源与当前源；该归档重放没有回退产品文件。所有失败和较早结果均保留，不当作最终通过。

## Reproduce / limits

使用已有Chrome与依赖，传入不存在的独占目录；重放归档源追加`baseline`：

```sh
PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node docs/verification/app-mobile-folder-interactions17/check-mobile.mjs docs/verification/app-mobile-folder-interactions17/reviewer-attempt01
```

Vite绑定127.0.0.1、hmr关闭、缓存限定本次目录；外部请求拒绝。finally关闭浏览器/server/Vite，作者自有临时vite-cache已移除。未运行带Rust Session/Store的共享smart-ui脚本，也没有扩大无关审计。

截图为工程错误反馈可见性，不是iPhone原版已证样式；原版长按时间、动画及像素一致性不作结论。新包实际移动验收完成前，本任务不能done。
