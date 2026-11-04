# Task28 fix01 — visible add circle hit area

SOURCE-READY STOP（2026-11-05）。此处只关闭首版独审发现的圆加号不可点击问题。产品仅在 `src/style.css` 的手机 `page-folders` 底栏左按钮增加 relative 定位和右扩10 CSS px的透明 `::before`。原24×24按钮、24px高度、SVG路径/槽、ARIA名称、回调及其他按钮保持。源码差异见 `fix.patch`，相对于封存的首版task28 CSS，不是相对于HEAD。

## Finite actual-App evidence

使用真实生产App/Editor/bridge和完整导入CSS，隔离browser-preview localStorage与本地请求。baseline只将生产style.css替换为本目录保存的首版CSS。390×746 logical viewport、DPR1080/390，PNG1080×2066；桌面1088×660、DPR1。宿主是macOS Chrome模拟手机视口，并非Android07准确安装包或iPhone输入证明。

- `baseline-attempt01/result.json`：复现加号圆心(45.6,713)命中footer，dialog0；原按钮中心(29,720)命中button，dialog1，Escape卸载。笔记页与desktop无pseudo。
- `candidate-attempt01/result.json`：圆心、圆内近右/上/下、右外圈笔画、原中心均打开；右外界不打开。在上界仅外出0.25 CSS px的(45.6,707.75)处命中button，断言失败，保留原始失败与执行脚本 `check-hit-attempt01.mjs`。
- `baseline-boundary-probe01/result.json`：有限边界诊断发现原24×24按钮在(29,707.75)同样命中，在(29,707)不命中。原按钮与扩展x位置各探测上下0.25/1px，共8点；这是宿主亚像素命中观察，不据此推断设备行为，也未调整产品。
- `candidate-attempt02/result.json`：最终9点全部符合。圆心(45.6,713)、内右(49,713)、内上(45.6,709.6)、内下(45.6,716.4)、右外圈笔画(50.1,713)、原中心(29,720)各打开一个真实表单并用Escape卸载；扩层右外(51.25,713)、上外1px(45.6,707)、下外1px(45.6,733)均不打开。无pageerror、无外部请求。

计算命中pseudo为 left0/top0/bottom0/right-10px，34×24；按钮外框仍x17/y708/24×24。notes与desktop的pseudo content仍none且position仍static。`comparison.json`确认整个mobile几何快照、SVG outerHTML与button rect精确相等；mobile/notes/desktop三组修前修后截图均0像素差。

## Execution and limits

`check-hit.mjs`为最终有限runner，附 `boundary-probe` 参数只作有限诊断，保留每次输出目录。每次运行都关闭Chrome、HTTP与Vite。使用运行时依赖：

```sh
PLAYWRIGHT_CORE_PATH=/Users/water/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core/index.mjs CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node docs/verification/mobile-folder-visual28-fix01/check-hit.mjs <new-output-directory> candidate
```

CSS-only修复按任务约束未重复首版7类检查、typecheck或平台构建。未运行GUI/ADB，未改用户数据库。`sealed-input-check.json`重新核对首版author53与independent15全部大小/SHA无差异；旧证据原样保留。source manifest明确fix01当前源身份，旧manifest保持当时身份。需另一作者窄复核，之后由root做固定源准确Mac12/Android07验收。本证据不宣称全像素对齐完成或设备验收通过。
