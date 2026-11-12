# DESIGN100A 设置基础交付

整合补记：4a49a633的F1修正经9196b4fd独立复审接受，已按c06d08e1基线差异整合主工作区。根目录生产build与新构建准确Store transport上的15项真实Preferences检查通过。全局变量应用和App保存回滚仍100，实际双端仍101；下文作者交付时点保留。

2026-11-09。开发基线 `c06d08e127f132dcf02a602154cf2f9ae02f92a5`，独立工作树 `/private/tmp/cybernote-interface-settings`。状态：配置/设置基础可审查，**DESIGN100整体尚未完成**。唯一配置规格仍为 `docs/ui/design-rules.md`。

## 交付范围

新增 `src/interface-details.ts`，提供readonly类型、经验证的百分比类型、完整version1解析、显式旧配置默认值及共享CSS变量映射。只有字段缺失（undefined）视为旧配置；null、非对象、未知/缺失键、未知版本、非有限/非整数/字符串数字和越界值整体验证失败，抛出 `InterfaceDetailsInvalid`，不静默截断。映射输出只由有界数字与枚举计算，未接受CSS字符串、z-index或用户自定义选择器。

变量包括图标scale/size、平台独立hit scale/min、menu min/extra以及button/card/menu/panel radius。手机hit最短边下界44px，桌面28px，radius输出0..24px。设置示例直接调用这个导出函数；全局消费也必须使用同一映射，避免另一套比例。

生产Preferences沿原有 `onSettings(Partial<Settings>) -> Promise` 接口接入独立 `PreferencesInterfaceDetails`，保留主题卡片、双五档字号和双端布局。新增默认折叠区，按图标、当前平台操作区域、菜单间距、圆角顺序展示滑条/选择控件、百分比范围、即时示例与恢复默认按钮；不显示另一个平台的操作区域项，但提交完整对象并保留它的值。重置只提交 `interfaceDetails`。设置中注明系统菜单遵循系统样式。

```text
外观与字号
  原主题 / 界面字号 / 编辑器字号
  [界面细节                         v] 默认折叠
    图标大小          ——●——  百分比
    操作区域          ——●——  当前平台值
    菜单间距          [紧凑 / 标准 / 宽松]
    圆角              ——●——
    即时示例          文件夹卡片 + 操作菜单
    系统菜单说明
    [恢复界面细节默认值]
  版本信息
```

展开内容在既有分类内滚动；手机控件/关闭区继续遵循原单栏布局。范围input清除浏览器默认margin，避免100%宽度额外产生水平溢出。菜单示例的最短行高仍满足平台下界，额外间距增加行内padding及最短行高；圆形语义操作控件未被全局样式覆盖。

## 保存确认与外部更新

父组件当前先乐观更新settings props，再等待持久化。详情组件保留最后成功确认的值，等待中仅示例预览候选值；失败恢复旧示例/控件并显示错误，不显示已保存成功。通过候选内容与实际已观察props身份区分本次失败的乐观值和之后的新外部设置，避免失败props反向覆盖旧确认值；之后持久成功的新外部对象（包含与先前失败候选完全相同的值）仍可更新。

测试使用真实Preferences，包一层模拟现有父组件的乐观props时序，直接调用真实Rust transport/Store保存。没有改App。此局部确认不修正父组件其他全局消费者的乐观状态；**DESIGN100整合必须同时落实App全局持久失败回滚/确认策略**，不能把局部示例保护当作全局完成。跨来源并发设置提交的全局排序仍由App设置所有者承担。

### F1 修复：等待期间的外部更新

独立审查发现初版在pending期间直接丢弃不同于本次候选的外部props。开发复现记录 `artifacts/design100a-order/before-independent.json`：初始100、提交101、外部111之后，ACK错误显示101，reject错误显示100。现在本次attempt记录最新的不同候选外部完整值；成功与失败结算都优先采用它，控件与示例保持一致，失败仍保留错误提示。本次候选的乐观echo只作身份观察，不作为外部确认，因此原失败隔离与后续相同内容新外部对象恢复行为保留。随后修改其他细节从最新确认对象合成完整patch，避免覆盖外部111。

F1验证：未修改的独立 `node scripts/check-interface-details100a-review.mjs` 两条生命周期探针均显示111（`artifacts/design100a-independent/lifecycle.json`）；作者新增 `node scripts/check-interface-details-order100a.mjs` 覆盖等待期间先109后111、ACK/reject后的控件/22.2px示例/错误提示及下一完整menuSpacing patch仍保留iconScale111（`artifacts/design100a-order/result.json`）。后者为真实组件与受控props/回执测试，不作Store证据。原作者真实Store15项重跑及 `pnpm build` 通过，分别见 `/private/tmp/cybernote-design100a-f1-local-retry.log`、`/private/tmp/cybernote-design100a-f1-build.log`。首次并行测试因Vite WebSocket端口冲突收到page errors而失败，顺序重跑通过，失败日志保留于 `-f1-local.log`；没有忽略错误断言。Rust未改，未重复编译。等待不同代理复审，本修复不关闭App全局排序与回滚待办。

## Rust持久与归档边界

`archive.rs`新增严格完整对象校验，`validate_settings`复用于归档读取/导出和Store settings动作。`store.rs`仅在合并patch后、SQL UPDATE前增加一次验证调用。现有自定义settings键兼容保留。非法细节拒绝整个patch（含同次theme变更），不部分保存；非法归档在写入前拒绝，现有workspace保持不变。合法完整对象可导出、导入并重开Store恢复；没有字段的旧归档保持缺失，由前端显式默认。

## 验证与证据

1. `node scripts/check-interface-details100a.mjs`：**15项检查通过**，真实Chrome156/Preferences + 当前源码Rust Store。桌面1200px、移动320/390px；明暗、默认折叠、Enter展开/收起、滑条上下界、最大图标/圆角与菜单间距的实际几何、重载恢复、原五档字号入口、重置只改细节均验证。手机保存时保留合法desktopHitScale130，不按手机范围误截断。
2. 失败通过隔离SQLite的真实 `BEFORE UPDATE ON settings` trigger返回ABORT，原设置请求未替换为假成功。父props已乐观变为119，控件/示例仍确认120，Store仍120；移除trigger后通过外部真实保存119同完整对象，组件可恢复显示119。每平台都覆盖。
3. `CARGO_TARGET_DIR=... CARGO_BUILD_JOBS=2 node scripts/check-interface-details-store100a.mjs`：真实生产Store/Session/archive，新增单个综合test通过（180个无关测试过滤，不声称全Rust回归）。覆盖17类非法完整对象的live patch与archive导入原子拒绝、合法导出/导入/重开、旧字段缺失、自定义键及重置保留主题和字号。
4. `pnpm build`通过：TypeScript及Vite生产构建。已有bundle>500kB提示保留，本轮未修改分包。`git diff --check`通过。

主要证据：

- `artifacts/design100a/result.json`：15项结果、真实Store路径、二进制及相关生产源哈希、browser错误列表。
- `artifacts/design100a/{1200,320,390}-{light,dark,maximum}.png`：三个宽度明暗/极值截图。
- `artifacts/design100a-rust/build.json`：真实transport编译的全部生产源及二进制哈希；`artifacts/design100a/owned-transport`为校验SHA后复制的owned二进制，避免共享target后来被其他任务覆盖。前端测试在使用前核对全部Rust输入哈希，拒绝陈旧transport。
- `artifacts/design100a-store/result.json`、`tests.log`：隔离常规src-layout测试harness、命令、source hash与真实test结果。
- `/private/tmp/cybernote-design100a-preferences.log`、`-store.log`、`-build.log`、`-rust-build.log`。

复现先运行现有native-free builder，再运行两个新脚本；Cargo target使用父任务已授权共享位置、jobs2，空间低于2.5GiB不启动额外测试编译。没有native build、ADB、设备安装或用户库操作。最初直接对debug transport的手工layout执行cargo test因cfg(test) fixtures路径/hooks不完整编译失败（`-rust-tests.log`），之后的新测试harness采用常规src布局、真实原模块、必要跟踪fixture及rusqlite/hooks解决；不改既有debug runtime/transport或测试业务断言。浏览器首次发现range默认margin导致2px横向溢出，修复后全部宽度通过。

## DESIGN100 / FINAL101 待办

本次**没有将变量挂到App root，也没有声称工具栏、侧栏、MenuSurface、附件按钮或原生toolbar已随配置变化**。对应全局消费、层级/z-index统一、覆盖整理、完整交互和App全局持久失败回滚均属于DESIGN100整合必做。当前设置示例和导出映射提供同一入口，不是整体应用的替代证据。

原生AppKit菜单间距/圆角仍由系统控制。Mac/Android真实包的可达性、命中区及原生图标支持仍由FINAL101验证；本轮Chrome与native-free Rust证据不推认原生系统外观改变。此前MEDIA99P冻结样本和测量工具路径未改动。
