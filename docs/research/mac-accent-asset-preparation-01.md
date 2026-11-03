# Mac 命名强调色资产：只读接入准备 01

2026-11-04，native_ui_research。仅按root要求准备后续最小方案；不加入unified candidate03，不改产品、系统偏好、资源、构建或GUI，不重复已存原版颜色测量。

已有依据保留在 [accent-evidence.md](macos-toolbar-host-deltas/accent-evidence.md) 与 [visual-followup.md](../verification/app-001-fix-02-visual-01/runtime-close-deferred-01/visual-followup.md)：前者记录已核WWDC20命名强调色与用户multicolor/显式选择机制，后者记录原版NSAccentColorName=Accent及已保全颜色样本。样本可作为数值参考，不能直接将Notes的整个Assets.car复制到克隆，也不能由元数据推导搜索ring已经匹配。

最小候选可定义克隆自有命名颜色，例如NotesCloneAccent，在自有asset catalog中记录参考sRGB数值；由可追溯的Apple资产编译器生成Assets.car，将其放入app的Contents/Resources根，Info.plist的NSAccentColorName引用同名。保留原生NSSearchField和系统命名颜色，不手绘金ring、不覆盖系统强调色偏好。用户显式accent仍交AppKit处理；是否与原版一致须另行原生新包观察。

本机现有Tauri CLI schema确认bundle.resources支持source→目标路径映射，能控制Assets.car位于资源根；macOS.files也存在，但本轮未核清其映射方向，不能把猜测配置作为已验证方案。后续如实现应只对Mac构建纳入该资源，并核最终app实际路径、Info.plist、资产名/颜色和签名，避免给手机打入无用Mac资源。当前src-tauri/Info.plist已用于Tauri合并；无须改原生搜索协议或F07。

本轮只读工具事实：

```text
xcode-select -p
/Library/Developer/CommandLineTools

xcrun --find actool
xcrun: error: unable to find utility "actool", not a developer tool or in PATH

xcrun --find ibtool
xcrun: error: unable to find utility "ibtool", not a developer tool or in PATH

xcrun --find assetutil
/usr/bin/assetutil
```

对已检查的/Applications、/Users/water/Applications与CommandLineTools文件清单未找到actool。该结果只说明当前选定工具链及所查位置没有可用编译器，不宣称穷尽整机。assetutil已存在只支持本轮已知只读核验用途，未证明它可替代actool生成合法命名资产。没有下载、安装、复制他应用资源或尝试私有运行时替代。

因此当前不能把“现成actool可直接编译颜色资产”当作构建前提。后续独立任务应先确认可用且获授权的资产编译器，或来源可复查的自有预编译产物及其源描述，再实施/独审/统一打包。该工具能力未就绪不影响candidate03已有无资产改动的Mac/Android构建排期。
