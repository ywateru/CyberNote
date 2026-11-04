# APP-001 wide toolbar geometry — source candidate 01

2026-11-04。状态 **SOURCE-CANDIDATE / pending independent review**；源码冻结后交不同代理复核，作者不自行合入或声明设备／像素验收。基线 `f8bff9d11583a06ae0eefa9fa1bd1e38f0e616d8`，隔离树 `/private/tmp/apple-notes-wide-toolbar-01`。仅一个产品文件 `plugins/tauri-plugin-notes-ui/macos/toolbar.m` 修改；没有 App/Editor/CSS、菜单、焦点、ACK、依赖或 Rust 产品改动。

## 修改与范围

既有 search 初始预算、drop 次序、overflow 和最终 search clamp 全部先运行。之后仅在 `three && hasSearch && visible.count == 7 && hidden.count == 0` 时，将最终 searchWidth 上限设为候选 325pt，再用实际 `widthFor` 计算可用剩余宽度，平均加入两个既有 18pt 组间距。visible 只由固定七动作集合构造，因此 count 7 表示全部七项仍可见。其余状态继续使用 18pt，搜索后 16pt 与右距 8pt 未改。

```text
符合门禁：新建36 ──18+spare/2── 编辑161 ──18+spare/2── 共享80 ──16── 搜索≤325 ──8── 窗口右缘
其他状态：现有drop/overflow/search/group位置原路径
```

325 来自已保存 JPEG 可见面的半尺度候选，不能称原版内部 frame 或真实布局算法。标题、分栏、新建起点、组内按钮命中宽度、保留搜索祖先／field editor 均未改。没有依赖固定 1392pt 窗口特例，也没有新增隐藏按钮的布局分支。

## 验证方法与结果

`check-wide-toolbar-geometry.py` 直接从当前生产源码截取完整 `widthFor` 和 `layout` 方法，原字节编译到离线 Objective-C 容器。相同方法也从冻结基线 `f8bff9d` 取得并编译。它们调用记录几何的 view/window ports 和 placeGroup sink；没有复制实现布局算法，没有创建 NSApplication、真实 NSWindow、AppKit 控件或 GUI。实际 `layout` 决定 start、hidden、drop、search clamp、全部组位置及标题；sink 只记录生产调用给出的 frame/actions，并维护最后可见组集合。

| 检查 | 结果 |
| --- | --- |
| 当前与基线真实生产布局计算 | 44 cases pass；7 个符合门禁的宽窗场景改变，其余 37 结果逐字段相同 |
| 宽窗／窄窗与 cap 阈值 | 700–1720pt；有侧栏阈值 1179pt、无侧栏且无隐藏辅助动作阈值 951pt，两侧连续 |
| 范围排除 | 七种缺单动作、三种缺组、overflow、侧栏动作放不下、viewOptions 放不下、无搜索／null、galleryBrowse/galleryExpanded/independent 两种侧栏状态和宽窄窗 |
| 稳定边界 | 所有 case 的 hidden/overflow、可见组、title/count/root 保持；目标 case 的组宽/actions、侧栏/view 及新建起点保持 |
| `xcrun clang -fsyntax-only … -Wall -Wextra -Werror format.m toolbar.m` | exit 0，无 stdout/stderr |
| 现有 `node scripts/check-native-toolbar.mjs` | exit 0，13 cases pass |
| 受保护路径相对基线 diff、源码／脚本 diff check | pass；未改 App/Editor/CSS、菜单/焦点/ACK、Rust、依赖/lock |

1392pt / sidebar228 / list280 示例是当前源码计算结果：新建 `[517,8,36,36]`、编辑 `[677.5,8,161,36]`、共享 `[963,8,80,36]`、搜索 `[1059,8,325,36]`，两间隔 124.5pt。此结果用于验证已批准候选公式，不能当作原版实测 frame 或像素匹配。

最终原始计算和全部输入在 `result.json`，精确生成的 baseline/current 源在 `baseline.m`、`candidate.m`，clang/native-toolbar 命令及 exit/stdout/stderr 在 `raw/`。本轮没有运行完整平台构建、安装、Mac GUI、Android、浏览器或 Rust target，没有下载、升级、复制缓存或清理证据。输出阶段均先 guard >=2GiB；证据约 0.75MiB，不包含二进制。

## 原始失败保全

- `raw/run01/`：基线离线编译 exit 0，执行因假 GeometryView 的 flipped 属性未声明 NSView 实际 `isFlipped` getter 而异常退出；保留当时生成源、运行 stderr 和 failure。修正的是 recording port，没有产品改动。
- `raw/run02/`：baseline/current 均编译并执行成功；本机 Python 不支持 zip(strict=True)，检查脚本在结果比较前失败。保留两次真实运行结果和 failure；改为显式长度断言再 zip，产品源码未变。
- `raw/run03/`：最终生产计算矩阵 44/44 通过。前两轮输出未覆盖、没有计作通过。

## 未验证

这些是受控生产计算与源码检查；placeGroup sink 不创建真实按钮，不能证明真实 AppKit 材质、命中、菜单锚点、拖宽事件、搜索 field editor、marked text、焦点/ACK 或像素效果。真实宽／中／窄三栏、输入连续性及菜单点击仍须统一新包实测；325 候选的原版近似程度仍待同条件截图。独立审查通过后才可由 root 记 SOURCE-READY，本任务不能关闭整顶部或整应用像素验收。

## 再执行与源码身份

仅需已有 Python/xcrun/clang。几何脚本内有磁盘 guard，输出目录须新建以保留历史失败；不会访问 Rust target。native-toolbar 需要已有同锁 Node 依赖，作者临时 node_modules symlink 在提交前解除，没有依赖安装。

```sh
python3 scripts/check-wide-toolbar-geometry.py artifacts/wide-toolbar-geometry/review-new-run
xcrun clang -fsyntax-only -fobjc-arc -fblocks -mmacosx-version-min=12.0 -Wall -Wextra -Werror plugins/tauri-plugin-notes-ui/macos/format.m plugins/tauri-plugin-notes-ui/macos/toolbar.m
node scripts/check-native-toolbar.mjs
```

产品 SHA256 `14f9d44bdd7b890aee5f190650ad1356904c3495240299f732e758dade2e710d`，单产品路径聚合 `feb5f45fd4fa56cfa4b7886fa138eff469b3684aaff8c5a9e409203c35003145`。完整身份、脚本 SHA、原始证据 SHA 和基线见 `source-manifest.json`。
