# 统一设置与数据82：作者验证

源码冻结提交 `8fd3e35f`，源文件指纹 `7a7025e49d58a4846ee6a4d984833b88c4723c9043b1859d9611fba3e4ce6ac7`（125个输入文件）。测试运行时HEAD仍是基线、工作区含这些待提交源码；最终07两端记录的输入字节与冻结提交一致，运行首尾指纹不变。

设置齿轮直接打开共同外壳；两枚图标标签切换设置和数据。数据首次访问才挂载，同次打开期间保留组件/快照/分类/搜索/页码/滚动/在途操作；隐藏面板使用hidden及inert，拒绝新调试数据操作。权限变化仍清敏感缓存并丢弃旧请求。统一Escape/Tab处理、关闭入口焦点恢复及两标签native contentOverlay投影，原媒体/保存/原生controller不变。

## 最终定向运行

| 命令 | 结果 | 原始记录 |
| --- | --- | --- |
| `pnpm exec tsc -b --pretty false` | 自然退出0 | `typecheck04.log`（无诊断） |
| `node scripts/debug/cli.mjs group preferences --out docs/verification/preferences82-author/preferences-desktop07` | 自然退出0，52 checks，pageErrors为空 | `preferences-desktop07.log`、目录内summary/suite/布局/DOM/native投影 |
| `node scripts/debug/cli.mjs group preferences --mobile --out docs/verification/preferences82-author/preferences-mobile07` | 自然退出0，50 checks，pageErrors为空 | `preferences-mobile07.log`、目录内summary/suite/布局/DOM |

最终组覆盖真实齿轮与手机菜单入口、即时设置与reload持久化、真实closeLocks动作、图标tab键盘、首次懒挂载、切换保留同一shell/data身份与分类/query/page/scroll、隐藏数据命令拒绝、备份取消/失败/重试、在途备份隐藏后自然完成且保留notice并不抢设置focus、隐藏迟到inventory遇prepare/commit、重开默认tab与新生命周期、未知枚举、BODY Tab/ShiftTab/Escape、正文不改写、合成活动录音与备份禁用、首次库存持续失败时的备份恢复可达、320/390/800/1280浅深及短屏布局。

`preferences82-native-projection.json`使用实际App→NativeToolbar→guest transport，并明确模拟Mac平台与原生IPC，只证明两标签contentOverlay投影及关闭后恢复，未证明AppKit窗口绘制。`style-preview/`两张1280预览已由根确认设计方向；最终320浅色设置与390深色数据图另做目视检查，无文本遮盖或横向溢出。

## 失败尝试与修正

01～06保留原始失败JSON、DOM、截图、suite及stdout，不作为通过证据。

- 01：runner误读backend calls记录，改为既有`workspace_action`及`type`字段；产品closeLocks行为正常。
- 02：开发React.StrictMode重放初始effect，runner原先假定只发一次请求。最小独立检查确认两次仅发生在初挂载；最终改为首次访问前0、首次完成>0、切换后计数不增加及保留实例/快照的行为断言。
- 03～04：authority prepare沿用现有access-cover隐藏全部非cover子层；runner误用可访问角色读取临时隐藏tab，再误要求浏览器保留原focus。最终用原始DOM验证敏感内容清空与迟到请求丢弃，并确认隐藏数据面板不抢焦点；保留cover安全行为。
- 05：发现实际焦点恢复缺陷：从BODY打开时BODY被当作可恢复入口，阻止fallback。产品现排除BODY/html、disabled、不可见及正在卸载的设置壳候选；最终BODY Escape覆盖修复。
- 06：库存失败fixture只失败一次，StrictMode第二次初次请求成功。改为持续失败至显式重试解除，验证真实无快照分支。

## 范围与交接

这是独立合成浏览器、JS协议持久化fixture、模拟对话框/原生IPC、固定440Hz合成音源验证；没有操作已装App、真实麦克风、真实用户笔记或Android旧现场。原版整窗像素、Rust Store、AppKit/TCC和设备安装不在作者定向证据范围。

旧77/79/81 runner仅适配真实入口、公共关闭和公共壳几何/首焦点；业务断言保留。根负责独立审查、主线统一全回归/production与双端打包，作者按约不重复完整旧组和不生成产品包。本worktree未运行Vite build，无作者运行中进程；源码冻结后只补本证据目录，index/dist交回根与独审。
