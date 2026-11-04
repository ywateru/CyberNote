# 文件夹侧栏直接恢复：源码候选

基线 `4d9dcbe`，作者树 `/private/tmp/apple-notes-sidebar-restore-01`，分支 `task/app-001-sidebar-restore-01`。依据root本机原版实际隐藏/恢复与当前clone05复现，任务为恢复直接入口。旧包overflow和显示菜单本来可以恢复，问题并非整个意图链失效。

产品唯一修改 `plugins/tauri-plugin-notes-ui/macos/toolbar.m` 的布局片段。主窗三态保留直接36pt toggleSidebar；隐藏时newFolder随侧栏消失，既不直接显示也不进入overflow。可见160pt侧栏先移除newFolder进overflow，保留toggle。隐藏三栏title frame154pt是原版JPEG标题墨迹约156pt、既有文字墨迹与frame约2pt差的候选，尚非原生内部坐标或像素通过。画廊仅保证标题与返回避让，不推定未知原版坐标。

```text
可见正常：交通灯 │ 新建文件夹  文件夹 │ 标题         │ 工具
可见160：交通灯 │ 文件夹          │ 标题         │ 工具/新建overflow
隐藏列表：交通灯 │ 文件夹  →      标题(frame154候选)│ 工具
隐藏画廊展开：交通灯 │ 文件夹  返回  标题            │ 工具
独立笔记窗：不增加文件夹动作
```

原有actionStates、buttonClicked→sendIntent窗口绑定、`src/native-toolbar-state.ts` 的非独立窗toggleSidebar投影、`src/App.tsx` 的toggleSidebar→setSidebar反转均未修改。原显示菜单sidebar命令继续转同一toggleSidebar意图。选择文件夹、笔记内容/宽度状态及搜索控件创建/更新、ACK、焦点、field editor、祖先可见性代码均未修改；这里是源码范围核对，不代替真实菜单点击和原生输入法验证。

## 验证与证据边界

`scripts/check-sidebar-restore-geometry.py` 直接截取基线/候选完整生产widthFor/layout方法，复用既有宽栏脚本的recording端口。抽取片段原样出现于生成的baseline.m/candidate.m。每条链复用同一个控制器、窗口端口、标题/搜索端口和组，依次调用显示→隐藏→恢复；不复制布局算法。placeGroup sink仅记录生产方法给出的组位置/动作，命中范围按未改的真实placeGroup等宽36pt划分及traffic保留检查。未创建NSApplication、真实NSWindow/AppKit控件，没有GUI操作。

| 检查 | 结果 |
| --- | --- |
| 生产布局回放 | 110状态/36条隐藏恢复链通过；三个主布局×700/1088/1392pt×160/228pt侧栏×fullSize有无，另2独立窗。旧基线36个隐藏态toggle进overflow均复现。 |
| 直接可达与避让 | 主窗toggle始终直接且36pt，中心避开88pt交通灯；隐藏newFolder不留overflow；全部可见组不重叠、在窗口内，标题/返回避让。 |
| 恢复与回归 | 每条恢复状态与链起始显示状态逐字段相同；228pt可见侧栏正常三栏与基线逐字段相同；合法独立窗与基线相同且无侧栏动作。 |
| `pnpm build` | exit0；既有大chunk提示保留，非失败。只前端构建，非Mac包。 |
| `node scripts/check-native-toolbar.mjs` | 13/13；控制器监听/绑定、失效、搜索ACK/受控composition与宿主投影检查。不是原生输入法实测。 |
| 严格ObjC语法 | format.m + toolbar.m，ARC/blocks/macOS12/Wall/Wextra/Werror，exit0。 |

最后检查的准确命令、stdout/stderr和空间见顶层 `frontend-build.json`、`native-toolbar.json`、`strict-objc.json`、`geometry-final.json`。结束可用空间约5.18GB，所有输出前检查>=2GiB。没有下载、升级、复制依赖/target、Rust构建、平台包、安装或GUI操作。仅临时使用主工作树node_modules符号链接，检查后解除。

历史失败完整保留：geometry-run01的方法抽取误用了information声明位置，未进入编译；run02复用recording控制器后，结果数组还引用可变recorded字典，断言暴露历史快照被覆盖。修正为拷贝记录字典后run03通过。最终154pt候选再跑geometry-final通过。失败不算通过，不修改或删除旧结果。生成的本地几何小程序不提交，生成源码、编译/运行原始JSON及失败材料均保留。

本项等待不同作者审查。实际新Mac包的显示→隐藏→直接恢复、菜单恢复、窗口宽窄、画廊返回、正常退出冷启与同条件原版像素仍待root后续验收；当前运行clone05不会因源码修复自动更新。
