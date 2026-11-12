---
id: app-android-mobile106
scope: platform-layout-editor-session
status: source-integrated-native-open
depends-on: [app-editor-session96, app-mobile-format102]
---

## 目标与证据

修正同一原生Android笔记在横屏跨700px后被切到桌面交互、进而触发会话navigation失效并清格式面板的问题。实际旋转观察及源码链见`../../verification/modernization101/mobile-format102-restored-ime-case.md`；最小方案见`../../verification/modernization101/android-stable-mobile-preflight.md`。该次旋转前未打开格式，不能倒推为原102长按故障原因，原失败保持开放。

## 行为与实现边界

遵守`../../architecture/editor-session.md`的106契约。集中一个平台布局决定入口，原生身份来自现有Tauri检测加Android平台特征，不用NotesKeyboard桥注入时点判断。App初始导航/恢复与resize共用规则：原生Android普通主窗口保持mobile，Mac/普通Web保留原699/700px断点，separate保留原排除。宽高仍更新，真实note/owner/Editor/授权/blocked失效不变；不隐藏所有reconcile、不绕setEditable、不扩展平板专用设计。

实际App检查进一步确认：只改JS身份不足，`src/style.css`中的手机区域/底栏/格式面板仍受699px媒体条件限制，在740px混入桌面布局。因此本任务必须把这些已有手机布局按`.mobile`身份应用到宽屏Android，限定手机选择器、不让非手机样式泄漏到桌面；真正依赖可用宽高的紧凑尺寸规则仍可保留。必须用可见几何验证编辑区、页面互斥、底栏、格式面板固定底部与44px触控区域，不能仅凭类名/formatOpen通过验收；Mac/Web/separate原有布局须定向对照。

```text
平台身份 + 独立窗口 + 当前宽度
           │
     统一布局决定入口
           ├─ 初始导航 / 笔记恢复
           └─ resize → 可用尺寸
同一Android owner/Editor不因尺寸变化失效
真实导航 / 撤权 / 销毁 → 原会话失效
```

## 执行与验证

独审首轮发现F1：手机“更多”SVG的`.mobile`前缀提高选择器优先级，覆盖既有统一reset，导致tiny字号/120%细节下出现旧圆框（padding1px、radius50%，原样式为0/0）。作者须在隔离树最小修正并保留原失败证据；不同代理复审通过前不整合、不构建。这个CSS问题与当前真机IME复发分别处理。

最终窄修`26ffffca`将36个新增scope改为`:where(.mobile)`以保留原优先级，`9e13a40a`独审接受；tiny/huge+120%控件与原CSS一致，dark背景由真实旧窄屏计算对照，新窄/宽屏一致。首轮F1、工具硬编码背景预期失败及正确对照均保留。root按before/after SHA精确整合六路径，会话控制器未改；新产品身份446输入/`74c0a8bbe365664d3100f66165ac4bf28427c34cf1650170865d6d40ceb8d55a`。证据`artifacts/android-mobile106-integration.json`与[独审](../reviews/app-android-mobile106-f1-independent.md)。准备新的106同源包，旧105包不含此改动；原生旋转/IME及原102长按仍开放。

作者在隔离小工作树实现，保留root冻结445输入指纹，以免改变正在接受的105测量/包身份。不构建原生包、不操作设备。真实App检查应覆盖横屏冷启动、同note非空选区/format在360→740→360和分屏仍可应用样式、底栏与命中尺寸；Mac/Web边界及separate；真实换note/撤权/blocked/销毁仍失效。先用旧实现证明新场景失败，再验证修正，避免仅测试纯函数。测量运行时暂缓浏览器/测试，待父级释放。不同代理独审后窄整合；整合后重新prepare最终同源包，旧105不能充当106实包验证。最终原生Android需真实旋转和IME实测；原102长按仍独立验收。
