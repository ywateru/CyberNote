# Storage overview81 frozen verification

产品与专项 runner 冻结提交：`4a996cfcf51c0fed7fb7ac85860b8c71f819276a`，基线 `a3fb1370`。仅修改 `src/DataManagement.tsx`、`src/DataManagement.css`、`src/data-management.ts`、新增 `src/storage-usage.ts` 与 `scripts/debug/storage-overview.mjs`。本目录为该提交的作者验证，不是独立审查或主线组合验收。

依据 `docs/ui/storage-overview.md` 与用户保全的 macOS 储存空间参考图，将数据管理重组为总占用、连续彩色比例条、图例、七个分类和同面板详情。按 frontend-design 指引，在已有系统风格内使用系统字体、paper/grouped 背景、14/16px 圆角、细分隔线与克制阴影。类别色为图片橙、录音红、视频紫、其他附件蓝、数据库青、日志灰、其他文件浅灰；文本同时表达类型与用量。总览不使用设备全盘容量，也不提供删除/清理。详情保留原文件信息与原字节导出。

## 冻结验证与原始记录

`commands.json` 保存完整 argv、cwd、冻结提交、exit code 和外层单调时钟 wall；对应 `*.stdout` / `*.stderr` 均为原始命令输出。`frozen-wrapper.py` 与 `browser-harness.mjs` 是执行时使用的外部 wrapper/harness 原件；runner 在冻结源码中。注意 `commands.json` 的 `startedAtUtc` 字段由原 wrapper 在所有命令完成后写入，实际是记录完成时刻，不能当作启动时刻；wall 使用 `time.monotonic()` 独立计算，不受这个字段命名影响。

| 命令 | exit | 完整外层 wall |
| --- | ---: | ---: |
| `pnpm typecheck` | 0 | 2.206s |
| `pnpm build` | 0 | 3.616s |
| 外部 harness 调用冻结 `runStorageOverview` | 0 | 14.967s |

三条命令合计外层 wall 20.886s。build stdout 中 Vite 的 1.41s 只属于其内部打包阶段，不代替完整命令 wall。build stderr 有既有的大于 500kB chunk 提示，构建成功。

冻结专项 `frozen-browser/report.json`：**68项通过**，`pageErrors=[]`，harness 内层 wall 14.863s。`source-before.json` / `source-after.json` 对全部 git tracked 非 docs 文件逐文件 SHA-256，汇总 hash 均为 `5110632ad84f686496d3b138c5973154c6f9e097e0a52f88ca4afaee54eb6cfe`，前后完全一致。构建与测试不改变产品源码。

保留 `author01-failed/` 初次失败原件：首项通过后 runner 错误假设 `app.state` 暴露 `dataManagement.snapshot`，发生 TypeError，非页面错误；修复 runner 直接使用替换快照记录来核对 helper，未修改产品绕过断言。`author03-report.json` 为冻结前68项成功记录，`author03-storage81-metrics.json` 保留其范围。最终结论以 `frozen-browser/` 为准。

## 68项的覆盖与边界

- 默认总览、七类别、整行/图例 Enter/Space 导航、返回、全部文件入口；每详情搜索和分页保留。
- 按首个物理路径去重、后置重复登记保留可见、零与未知区分、目录/缺失不计入字节，分类合计不一致时隐藏误导占比并提示刷新。
- 真实 React App 与组件导出处理器；以文件选择器替身加入小 PNG 后，验证分类详情导出的真实附件 ID 与逐字节内容。取消无成功、失败保留错误、重试仅发布一次，统计不读取附件 payload 或改编辑器正文。
- 备份取消/成功、实际 App 导入保存屏障与 prepare/commit、活动录音禁用两备份、访问切换清敏感列表/总量/筛选、失败重试、旧刷新响应丢弃、关闭时晚响应不复活。
- Tab 双向焦点循环、Escape、固定 header/关闭可达；`--native-top:44px` 是 CSS 模拟预留。
- 320/390/800/1280 CSS px × 浅/深主题 × 总览/详情，共16份 PNG与HTML snapshot。测试将高度设为844；metrics 中 runtime metadata 的初始 viewport 1280×800 是 runtime 启动信息，实际各张 PNG/geometry 对应测试后视口。320和390浅深详情的 `overflow=[]`，`scrollWidth===clientWidth`；总览左右边界分别0..320与0..390，关闭按钮均在视口内。桌面800px时面板752px，1280px时面板760px。

**统计快照和浏览器 IO 均为显式合成测试。** 浏览器使用真实 App/DOM/组件 handler，文件系统 inventory stat 行是 typed 合成 fixture；默认后端为 isolated JS protocol fixture，原生 IPC/选择器/剪贴板/录音设备模拟。录音使用固定440Hz PCM/WAV、真实 AudioContext 解码与产品 PCM 累积，不使用真实麦克风。这里不证明真实磁盘 stat、ContentResolver、Rust Store、OS/TCC 或原生标题栏。79的真实后端验证单独记录；80图片预览与主线原生 overlay 联动由父代理另做组合验收。本轮没有驱动原Mac备忘录、原Android设备或其未保存录音现场，不声称原版整窗像素一致。

## 截图与DOM

- 桌面总览：`frozen-browser/storage81-1280-light-overview.png`
- 桌面详情：`frozen-browser/storage81-1280-light-detail.png`
- 320深色详情：`frozen-browser/storage81-320-dark-detail.png`
- 390浅色总览：`frozen-browser/storage81-390-light-overview.png`

上述及其余12张截图旁的 `*.snapshot.json` 保存HTML/可访问/几何证据，`frozen-browser/storage81-metrics.json` 汇总布局、pageErrors与模拟范围。人工查看冻结1280浅色总览和320深色详情：层级、完整长路径换行和大小日期可读，没有裁切或横向溢出。完整分类列表中尾部备份区通过面板滚动可达。

## 组合接口

`DataManagementHandle.navigate(view)` 支持 `overview | all | image | audio | video | attachments | database | logs | other`，`inspect().view` 返回当前视图。`filter` 保持旧 kind 语义，只有query/page时在总览进入全部文件、在已有详情保持类别。父代理在App/catalog注册 `data.navigate` 并调整旧79专项导航。81 CSS暂保留旧图片相关规则以保持独立基线可用；80已有独立ImagePreview样式，主线组合可处理重叠。此任务不改App/native/Editor或共享debug catalog/cli/scenarios。
