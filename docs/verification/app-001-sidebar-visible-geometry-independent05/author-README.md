# 可见侧栏工具组校准05：作者验证

本轮仅修改 `plugins/tauri-plugin-notes-ui/macos/toolbar.m`。任务与依据由root固定于 `docs/plan/tasks/app-001-sidebar-visible-geometry05.md`、`docs/ui/macos.md`，原版JPEG与AX在 `docs/verification/mac-same-columns-runtime05/`。这是待独立复核和准确Mac包真实窗口验证的候选，不授予像素PASS。

## 固定产品

- 作者开始HEAD：`26d517fa4266923974105879063f49d744f72f4a`；root在本任务期间提交此前已独审paper为 `eb3ece055fd769ecb16f0f6a2dc2ae9ae775ae35`。两HEAD的toolbar与本目录 `baseline-toolbar.m` 相同，SHA256 `0deb20826e37511f0654c1c355901ffe10877416fcf98fa8dd32c2cc88c90588`。
- 最终toolbar SHA256：`0b9604a73df6f2b1756cfd8489fff133a97c2cc3810df67372ec5ab878067da5`。`product.patch` 固定完整改动。
- App SHA256保留 `6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4`；CSS保留 `d7facf680ee801c348fd2ed0619213e0fc916d276f8fb3ddef1a78d11acf44d7`。
- `identity-open.json` 和 `source-audit.json` 比较开始时全部tracked文件。除toolbar，root提交带来 `docs/INDEX.md`、`docs/plan/README.md`、`docs/ui/local-features.md` 三份文档变化；其他开始输入字节固定。作者未修改这三文档。

## 实现与边界

侧栏单独使用稳定透明 `NotesUIRoot` 宿主，稳定玻璃/旧系统visual effect背景与原稳定content为同级前后层。可见时只隐藏背景，按钮及其content保留；隐藏时显示同一背景。`placeGroup` 仍等分按钮，专为sidebar显式同步背景尺寸。实际AppKit检查发现仅autoresizing不足，原始失败与修前源码已保留。

可见按钮每项44pt，组右边界对齐sidebarWidth；起点至少为保留交通灯的94pt（非fullSize为12pt）。如两项放不下，仅newFolder进入overflow，toggleSidebar保留。隐藏继续原36pt、xtraffic、标题避让；独立窗仍无侧栏组。原版墨迹支持靠右与随边界移动，44pt槽宽/right anchor为推断候选，仍需新包对照。

只为toggleSidebar统一使用系统动态labelColor，保留selected状态/AX/动作及其他按钮的selected tint。其他组仍走原makeGroup，图标/字号不改。macOS26的glassStyle更新显式包含新的sidebarBackground；fallback保留旧material/blending/state/radius。没有IPC/状态副本/数据变动，也没有重建按钮或搜索控件。

## 生产布局与实际AppKit检查

`check-geometry.py` 复用 `scripts/check-wide-toolbar-geometry.py` 的PREFIX/SUFFIX recording端口，编译准确production widthFor/layout，并以同一记录控制器连续更新state。最终 `geometry03/` 390状态、120链通过；包括三种主布局，700/1088/1394窗口，160/208/228/273侧栏，fullSize有/无，显示→隐藏→恢复；另含181.999/182边界、独立窗、6条侧栏与窗口宽连续拖变链。138个可见态旧布局偏差被旧/新输出直接复现。标准请求尺寸的其他组、标题、计数、overflow、search frame逐字段旧/新相同；隐藏输出逐字段相同，恢复输出与前态相同。sidebar本身与工具组/标题/返回无重叠，按钮槽位在交通灯保留区外。

存在既有范围外限制：threeColumn/700/side273在visible/restored、fullSize有/无共4状态中，标题291..502与view496..532重叠6pt，baseline与candidate逐字段相同。`geometry01/failure.json` 保留首轮严格无重叠失败。后续明确要求这类非sidebar既有重叠baseline完全相同并逐项记录，未改其他组规避失败。

`check-appkit.py` / `appkit-main.m` 编译完整生产toolbar源与format.m，不替换生产build/apply/layout/placeGroup；窗口端口是NSObject持有实际NSView。最终 `appkit07/` 旧源、候选glass、候选强制fallback三套binary各390态/120链通过：

- 实际NotesUIButton、NotesUIRoot、NSSearchField、NSGlassEffectView/NSVisualEffectView；所有button、content、group、root、title/count/search及背景引用保留。
- 实际background显示/隐藏、同级层次、不承载content、背景与host尺寸同步，regular→clear→regular style；Aqua/DarkAqua appearance切换。
- 实际可见控件AX label、enabled、target、selector、toggle动态labelColor对象；actual placeGroup/button frames与recording布局一致。
- 可见和隐藏候选root深层命中及button本地命中到同一NotesUIButton。旧glass在无窗口setup的root命中返回effect；保留此观察，不能当旧包实际点击故障，也不能将新候选此项视为真实窗口点击验收。
- 真实NSView父视图不flipped，生产root y=900-52=848；recording父视图flipped，root y=0。分别精确验证，未混为同一frame。

没有创建真实NSWindow或显示窗口；AppKit在创建控件时隐式初始化NSApplication，窗口数始终0。搜索currentEditor始终nil，所以本项只证明对象/祖先保留，不能证明实际field editor/IME/焦点体验。fallback由受控class resolver仅对NSGlassEffectView返回Nil强制进入原生产fallback，并非旧macOS实际运行。上述均无GUI/ADB/设备/真实菜单弹出、原生事件、包或像素验收。

## 原始失败保留

- geometry01：发现上述baseline已有6pt标题/view重叠；geometry02保留记录，最终geometry03增加连续拖变链与源hash。
- appkit01：fixture的baseline分支visible变量未使用被-Werror拒绝，产品未变。
- appkit02：fixture错误要求无窗口旧glass root hit必须button，实际返回NSGlassEffectView；产品未变。
- appkit03：fixture错误要求整个过程NSApp为nil，控件初始化会隐式初始化NSApplication；窗口数0的正确边界随后加入，产品未变。
- appkit04：候选背景autoresizing不足；保存 `candidate-before-explicit-background-frame.m`，生产placeGroup增加sidebar专用frame同步。
- appkit05：fixture错误直接比较flipped recording与unflipped实际父视图root y；调整比较以分别验证生产分支，产品未变。
- appkit06：fixture错误要求无窗口新旧玻璃root命中同class，实际候选同级content均到button；改为断言候选所有root/local hit到保留button，保留旧观察，产品未变。
- 每次原始生成的m、compile/run/failure JSON保留；failed脚本/main快照补充复现边界。

## 受影响检查

`strict-objc.json`：xcrun clang -fsyntax-only、ARC/blocks、min12、Wall/Wextra/Werror检查toolbar.m与format.m，exit0。

`native-toolbar.json`：现有scripts/check-native-toolbar.mjs 13项全通过，包括绑定/revision/search composition和回收；这是控制器受控transport检查，不是真实原生事件。

`build.json`：pnpm build exit0；保留现有大于500kB chunk提示。仅前端受影响构建，没有运行Mac/Android平台构建、freeze、共享target/cache操作、下载/升级、GUI/ADB、stage/commit。每个构建前检查>=2GiB。

## 后续准确Mac构建复用入口（未执行）

canonical tools为 `docs/verification/unified-candidate06/preparation/freeze-inputs.py`、`run-build.py`、`collect-outputs.py`、`common.py` 和README。Mac不需要Android recovery工具或 `--allow-scoped-gradle-offline-init`。

root独审后固定最终committed40位HEAD、完整productPaths/inputPaths、productAggregate、新runDirectory/artifactDirectory，九键schema1授权；冻结后审查准确freeze文件SHA，再运行：

```sh
python3 -B docs/verification/unified-candidate06/preparation/freeze-inputs.py --authorization AUTH
python3 -B docs/verification/unified-candidate06/preparation/run-build.py --authorization AUTH --freeze-sha256 FREEZE --attempt attempt01 --exclusive-target-and-cache
python3 -B docs/verification/unified-candidate06/preparation/collect-outputs.py --authorization AUTH --freeze-sha256 FREEZE --attempt attempt01
```

完整inputs应沿用此前freeze全列表并加入新产品路径，包括忽略的插件资源、两generated文件、五patched依赖；不能仅git tracked列表，不能复用Mac04旧aggregate/SHA/freeze。runner固定pnpm mac:build，CARGO_NET_OFFLINE=true、CARGO_BUILD_JOBS=2；共享锁 `/private/tmp/notes-unified-candidate04-build.lock` 与exclusive参数是root串行操作声明，无需向用户重复请求既授权动作。工具仍要求Android/Java现有环境路径存在（Mac也执行环境完整性检查），缺失不得下载。

固定产出路径 `src-tauri/target/release/bundle/macos/备忘录.app`；collection在新artifactDirectory/mac-attempt01保存original与派生adhoc sealed app/zip，各自签名结果。不得以旧包或失败attempt替代。仍须root实际验证可见/隐藏/菜单恢复/拖窄、正常退出重启和原版像素对照。
