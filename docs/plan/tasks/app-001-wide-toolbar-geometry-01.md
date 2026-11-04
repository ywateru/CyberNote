---
id: app-001-wide-toolbar-geometry-01
scope: mac-three-column-wide-toolbar-spacing
status: pending-review
depends-on: [app-001-search-zero-geometry-01]
---

## objective

修正candidate04在宽三栏窗口中搜索框占尽余量、编辑和共享组挤向左侧的已测几何差异。按UI新增契约，仅在threeColumn、hasSearch、全部七项动作仍可见且hidden为空时，以325pt为搜索宽度候选上限，把剩余空间等分给新建→编辑、编辑→共享两个既有间隔。先保留原drop/overflow决策；窄窗不足、缺组、无搜索及其他布局的行为保持原契约。此项只校准可见布局，不完成全顶部或整应用像素验收。

## context

- docs/INDEX.md、docs/ui/macos.md宽窗三栏校准
- docs/research/mac-zero-candidate04-geometry-01/README.md及原始JPEG/AX
- docs/research/mac-wide-toolbar-layout-01/README.md、measurements.json
- docs/plan/tasks/app-001-fix-02.md、docs/plan/tasks/app-001-search-focus-01.md
- plugins/tauri-plugin-notes-ui/README.md、macos/toolbar.m

## path

仅plugins/tauri-plugin-notes-ui/macos/toolbar.m中layout对应的几何计算/必要局部纯函数、必要定向校验脚本、本任务报告。不得改App/Editor/CSS、Rust存储、native菜单路由、依赖/lockfile、现有搜索生命周期或公共相等/授权协议。其他任务正在修改App/Editor及审查Rust缓存，不与其共写；使用root创建的隔离worktree。

## layout

```text
原逻辑：drop顺序/hidden → searchFinal夹紧
若三栏/有search/七动作齐全/hidden=0：
  searchNew=min(searchFinal,325)
  spare=max(0,available-widthFor(finalVisible,searchNew,false))
  两处18间距各增加spare/2；共享→搜索16不变
其他状态：原路径
```

325来自JPEG可见面650px的半尺度候选，非原版内部参数证明；材料、边框、绝对原点/比例、组起点的约1pt差及sidebar按钮不在本项猜测修正。不能靠固定1392窗口特例或隐藏控件达成对图。保持实际按钮frame宽度、原搜索祖先和field editor，不能为布局重建或临时隐藏搜索。

## verification

在已有工具和依赖下做ObjC语法及现有原生顶部/菜单搜索受影响检查；定向几何检查必须调用实际生产计算/布局，覆盖宽窗、刚到cap阈值两侧连续、窄窗无额外间距、overflow/缺组/无搜索、galleryBrowse/galleryExpanded/independent和侧栏可见性条件，不能只在测试里重抄公式。保留失败日志与源hash。不得下载、升级、复制target或删除证据。每个新增输出阶段先确认>=2GiB可用空间。

本轮不做平台整包/安装/GUI，也不占host Rust target（由标签独审独占）；可用既有clang做独立小输出。提交后由不同代理独立review，再由root整合并安排统一新包。代码检查通过只记SOURCE-READY，真实输入法/菜单锚点/拖宽/同条件截图与像素仍需安装版复验。

## source candidate 01 / 2026-11-04

仅toolbar.m的drop/clamp之后追加三栏／hasSearch／七动作齐全／hidden0的325pt cap与两个18pt间隔的剩余均分，其余组、隐藏次序、菜单、搜索实例及焦点/ACK未改。证据在 `docs/verification/app-001-wide-toolbar-geometry-01/source-candidate-01/`：直接抽取生产widthFor/layout方法的离线当前／基线执行44/44，通过37项精确原布局保持和7项目标宽窗计算；严格clang语法及既有native-toolbar13项通过。两次早期harness兼容失败保全，未计通过。产品SHA `14f9d44bdd7b890aee5f190650ad1356904c3495240299f732e758dade2e710d`。

当前 SOURCE-CANDIDATE / pending-review，交不同代理独审；没有GUI、平台包或Rust target操作。325仍为JPEG测量候选，真实拖宽／输入法／菜单锚点与新包像素均未验，不能关闭APP-001整体。
