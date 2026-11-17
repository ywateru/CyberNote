# 外观、清单与 MCP 测试程序交付

日期：2026-11-17。本轮承接用户截图反馈，契约见[本轮任务](../../plan/appearance-mcp-tester-20261117.md)。状态：两项实现、独立复审及合并后的组合命令检查已完成；UI 由用户验收。组合产品源码提交 `ef490c77`，其后的收尾提交仅更新文档。后续按用户要求从 `c406086d5bbe` 打包、重启 Mac、覆盖安装并打开 Samsung 真机，见[安装与空间清理](DEPLOYMENT.md)。

## 范围

- 八套双明暗色板、桌面正常宽度四列预设、纸感统一与高对比细线、原生顶部同源配色投影。
- 桌面和手机的圆形紧凑待办清单，首行对齐，内部段落不继承额外间距，保留文档/编辑器所有权。
- Agent 接入中的 MCP 测试对话框：真实 stdio、手动逐工具调用、只读及显式读写批量、停止/关闭与访问变化清理。

八套为经典、纸感、高对比、海洋、森林、玫瑰、薰衣草、石墨，各有浅色/深色。桌面正常宽度四列，窄宽和大字可降列；手机保留完整八选项选择器。Paper 的原生 toolbar/window 采用同源色板，系统菜单/玻璃材质仍由 macOS 控制。清单提供旧 WebView 的 em 首行对齐回退，不依赖新 `lh` 单位才能成立。

测试入口：桌面“设置 → Agent 接入”，开启宿主并选择有效授权、填写真实适配器绝对路径，点击“启动 MCP 测试程序”，再点击“连接”。工具/schema 来自真实 `tools/list`。批量只读不展示已有正文；显式读写仅修改当轮新建测试笔记，笔记会留存。恢复区发送前记录原工具/参数/幂等键，有 operationId 时只读查询；最多100项，重连保留，关闭对话框后不持久化。详情见[接入指南](../../agent-usage.md)。

## 命令与独审结果

| 检查 | 结果 | 实际范围 |
| --- | --- | --- |
| `node scripts/check-editor-schema.mjs` | 96 个文档用例通过 | 主树实际编辑器 schema，先生成外观检查所需模块 |
| `node scripts/check-appearance117.mjs` | 742 项通过，其中720对颜色对比 | 八主题、设置 owner、启动缓存、ProseMirror 勾选撤销/重做、清单与旧引擎回退的有限 CSS/表达式检查；不等于浏览器排版验收 |
| `node scripts/generate-theme-tokens.mjs --check` | 通过 | CSS 和 AppKit header 均与 palette 源一致 |
| 原生 Store 外观归档窄测试 | 1 passed / 0 failed | 八主题保存、导出导入、重开、迁移及非法配置原子拒绝；独审实跑，后续修复仅 CSS，不重复 |
| `node scripts/check-mcp-tester117.mjs` | 69 项通过 | 主树 DTO、批量、原始回调竞态、恢复信息和 handler 接线；无 UI 自动化 |
| `cargo test --locked --offline --manifest-path scripts/mcp-tester117/Cargo.toml` | 8 passed / 0 failed | 作者及独审实跑；生产 Registry + 替身 Desktop、受控子进程及真实适配器→私有 IPC fixture；扩展在途/排队取消、权限变化、回收和 slot 复用断言 |
| `pnpm build` | 通过 | 合并后 `tsc -b` + Vite 生产构建，1989模块；保留 >500kB chunk 提示，不是性能验收 |
| `CARGO_BUILD_JOBS=2 cargo check --locked --offline --manifest-path src-tauri/Cargo.toml --lib` | 通过 | 合并后真实 Tauri/原生插件和命令编译，20.96秒；26条现有警告保留 |

MCP Rust 完整复跑需显式设置 `MCP_TEST_ADAPTER` 为真实适配器路径；本轮使用 `artifacts/releases/20261117-project-evolution/mcp/cybernote-mcp`，并设置 `CARGO_TARGET_DIR` 为现有主缓存 `src-tauri/target`、`CARGO_BUILD_JOBS=2`。省略适配器变量时不能把该项当成真实适配器证据。没有另建 target 或修改旧包。前端检查按表内 schema → appearance 顺序运行，不把未生成的忽略文件当作干净 checkout 自带输入。

独审关闭的问题：外观 `lh` 缺少旧引擎回退；测试器重入 Stop/Close 与迟到收尾竞态；批量错误恢复元数据丢失。原始 blocked 报告保留，最终以[外观复审](../../plan/reviews/app-appearance117-recheck.md)和[测试器复审](../../plan/reviews/app-mcp-tester117-recheck.md)的 PASS 为准。

原始主树输出位于本机 `artifacts/appearance117/result.json`、`artifacts/editor-schema/result.json`、`artifacts/feedback117/{frontend-build,native-check,mcp-tester-check}.log`；视觉作者/独审材料保存在 `artifacts/feedback117/appearance-author-review/`。这些产物不纳入 Git。

## 验证边界

源码验证阶段采用命令与单元/功能测试，没有运行 UI 自动化或操作用户日常资料库/原手机。后续部署阶段按用户明确要求正常重启 Mac、保数据覆盖安装并打开原手机应用；仅核对进程、签名、包身份与安装元数据，没有操作笔记或测试 UI。UI 的像素、原生材质叠加、手机触控/输入法实际效果由用户验收。受控 stdio fixture 与真实适配器测试不等于通过新测试界面完成真实用户资料库验收。

插件新增 enum 单测因独立锁文件触发额外依赖编译，在磁盘不足前主动中止，未执行到测试，不能计为通过。合并后的真实插件已随原生 `cargo check` 编译通过。测试器本轮尚未通过新界面连接真实 Session/SQLite 验证批量落盘/重启；既有 MCP 宿主的历史数据链证据仍按[前轮报告](../project-evolution/DELIVERY.md)读取。

`artifacts/releases/20261117-project-evolution/` 是前一轮安装包和适配器，保持原构建身份。本轮新包位于 `artifacts/releases/20261117-feedback117/`，双端共用 release stamp 且实际包入口与嵌入前端身份核验通过；Mac 已运行该目录应用，手机实际 APK 摘要与新包一致。适配器没有修改，继续使用前一轮准确路径。两个本轮 worktree/分支已在合入后清理；随后按用户要求清理旧 debug 缓存、非 release 候选包、隔离 AVD 及打包中间文件，保留资料库、release 与日志，见[详细记录](DEPLOYMENT.md)。

## 用户 UI 验收顺序

1. 在桌面“设置 → 外观与字号”确认八套外观，正常设置宽度四列两行；分别切换纸感/高对比的浅色与深色，检查顶部与下方工作区色系、分隔线和焦点是否清楚。系统明暗策略另检查一次。
2. 在桌面粘贴截图中的三行待办，检查圆形框与首行文字对齐；增加长行、嵌套和已完成项，勾选后撤销/重做。调大/调小编辑器字号，圈和文字应一起对齐。
3. 手机打开同一类清单，检查行距、换行和勾选；点击圆圈左侧附近应可操作，正文仍可长按选字。普通段落不应随清单间距变化。
4. 桌面“设置 → Agent 接入”，开启宿主、建立测试目录授权、填写适配器路径并启动测试程序。连接后检查真实工具/schema，手动调用 capabilities / folders / list / read，再运行默认只读批量。
5. 显式勾选读写批量，确认新建的测试笔记及逐项结果/回执。测试笔记会留存；既有笔记应不被批量修改。缺少 update 权限的授权应显示跳过。
6. 在连接或调用过程中停止、连续关闭、重连，检查焦点恢复与可见状态。关闭宿主接入或撤销授权后，旧连接应不可继续调用。超时写入保留恢复依据，不当作未提交另建一次。

以上是交给用户的待验步骤，未执行不标通过。
