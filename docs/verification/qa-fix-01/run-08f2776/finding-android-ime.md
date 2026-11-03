# FIX01 P1：真实系统键盘遮住格式工具栏

基线 `08f2776`，已安装 APK SHA-256 `9e170f3b07e2b1493e4f555b23845a533ea72d9d98e3981563f60ad9f9814204`，从设备 `base.apk` 实际回读精确匹配。设备 emulator-5580，Android11/API30、1080×2280、density440、Chrome91 WebView、Google LatinIME。

## 最小复现

1. 原生触摸右下新建备忘录，系统键盘实际出现。
2. 用 Android 原生输入写入合成文字，或实际点击系统键盘按键。确认截图有可见 IME，而不是仅 Editor focused。
3. 尝试点击“格式”。键盘显示时，整条格式/清单/表格/附件/绘画/收起键盘工具栏位于键盘后，屏幕上没有可点击的格式入口。按 DOM 中该按钮中心换算的原生屏幕坐标触摸，实际命中系统键盘，面板不打开。
4. 按系统 Back 先收起键盘，Editor 仍聚焦，此时工具栏可见；再次原生触摸格式，面板可以打开。这是绕行，不能判 AND-01 的“键盘→格式”通过。

## 实际证据

- `and-keyboard-before-actual.png/json`：真实键盘显示，编辑工具栏完全不可见。
- `and-real-body-input.png/json`：实际正文输入时仍遮挡。
- `and-format-x.png/json`：可从绕行打开的面板点 X 回到系统键盘，随后工具栏再次被遮挡；IME=true。
- `and-format-native-occluded.png/json`：真实触摸被遮挡按钮位置的结果，面板没有出现。
- `and-native-back-keyboard.png/json` 与 `and-format-via-hidden-ime.png/json`：先系统 Back 收键盘后，原生触摸可打开格式。
- `android-keyboard-window.txt`、`android-keyboard-ime.txt`：遮挡状态的原始系统窗口/输入法信息。
- `android-actions.jsonl`：逐项原生输入和只读观察记录。

读取的布局数据：WebView 视口持续 `[393,751,2.75]`，不随 IME 缩小；原生 WebView 顶端为截图中的83px。格式按钮 rect=`x21.34,y710.52,w42,h38`，中心换算约 `(116,2089)` px，落在系统键盘区域。截图中的 IME 从约1463px开始，底至2148px；应用工具栏设计位置约2037–2141px，完全落入其中。几何仅用于说明原图观察，结论依据屏幕不可见与原生触摸实际命中 IME。

## 源码与范围

提交中的 MainActivity 对根内容只应用 `systemBars` padding，没有据 `Type.ime()` 更新旧 WebView 的可见布局。此处提供修复定位，不替代运行结果。开发者自检脚本通过 DOM `.click()` 触发按钮，因此绕过了真实可触摸性，不能作为该用户路径通过证据。

阻止 AND-01、键盘状态下的格式/表格/清单入口验收。绕行面板的 X 恢复 IME、Back 关闭面板可分别验证，但不能抵消该 P1。此 finding 不推断中文组合输入正常，也不把 adb `keyevent66` 等同系统 IME Enter；本轮另通过点击系统键盘 Enter 实际生成正文，相关准备偏差原样保留。
