# CyberNote 设置图片生成提示词

模式 `ui-mockup / generate`，后续使用 edit 做定向修正。用户已明确授权 CLI 备用路径，使用技能脚本及默认 `gpt-image-2`，未换模型。正式输出保存于 `output/imagegen/settings-redesign-20261107/`，与前期线框分开。下文是第一轮规格；实际完整提示词（包括补齐页面与定向修正）逐份保存在 `generation-prompts/`，第一轮任务保存在 `generation-jobs.jsonl`。

线框为布局参考，对话中 CyberNote 主界面为风格参考。不得提交真实用户备注截图；以下时间、设备和存储值均为示意，不生成真实配对串。

## 桌面外观与字号

```text
Use case: ui-mockup
Asset type: high fidelity Chinese desktop application settings design, not marketing art.
Primary request: redesign CyberNote settings as a compact, usable macOS-style panel. Flat front view, crisp PingFang SC / system type, white content, cool pale gray navigation, amber selection. One app window on a 1440x1000 board, no hardware or perspective.
Composition: preserve the complete existing main window top toolbar in its original position above settings. Its controls use a standard disabled appearance. A 920x660 settings panel below the toolbar; dim only the note area behind it. No fake traffic lights inside the panel. Header “设置” and close icon. Sidebar width 196px; rows exactly “外观与字号”, “备忘录”, “设备同步”, “存储空间”, “导入与备份”. Select “外观与字号” in pale amber.
Right heading “外观与字号”. Section “外观”: three compact preview choices “跟随系统”, “浅色”, “深色”; select “跟随系统”. Section “界面字号”: five choices “极小”, “小”, “中”, “大”, “极大”; select “小” with a checkmark. A small UI sample shows folder icon, “工作项目”, secondary “12 个备忘录”. Section “编辑器字号”: same five choices, select “中”. Sample heading “让记录更自然”, body “把想法写下来，留给下一次灵感。” Quiet footer “更改立即生效”. No Save button.
Constraints: complete main toolbar stays visible, disciplined spacing, desktop body 14px visual scale, heading 20px, consistent line icons, native buttons and shared menu appearance. No oversized headings or a card for every row. Correct Chinese. No account, iCloud, ads, charts, decorative gradients or invented features. Synthetic note content only. All controls within panel bounds.
```

## 桌面设备同步

```text
Use case: ui-mockup
Asset type: high fidelity desktop settings screen using the same CyberNote system as appearance screen.
Primary request: one 1440x1000 Chinese design board, complete existing toolbar visible at top with disabled controls. A 920x660 panel below it; header “设置”, close icon, sidebar “外观与字号”, “备忘录”, “设备同步”, “存储空间”, “导入与备份”. Select “设备同步”. White content, cool gray sidebar, restrained amber selection, thin separators, system Chinese type.
Content heading “设备同步”. Status green dot and text “已连接”, supporting “最近成功同步：今天 10:28”. Compact “立即同步” and secondary “停止同步”. Label “本机” value “我的 Mac”. Heading “已配对设备”, one row phone line icon, “我的手机”, secondary “已连接 · 今天 10:28”, row action menu. Rows “添加设备” and “更新连接”, each with chevron. Group “需要处理”, row “冲突版本”, value “0 项”, chevron. Collapsed disclosure “连接详情”. Normal connected state has no port, URL or invitation form visible.
Constraints: distinguish last successful sync from mere connection. No cloud subscription, automatic cleanup, QR code, avatar or account. No ornamental charts, oversized status banner or inflated content. Native-style buttons. Synthetic names and time only.
```

## 移动设置流程

```text
Use case: ui-mockup
Asset type: three mobile application screens side by side, Chinese UI, no hardware or perspective.
Primary request: CyberNote mobile settings with different navigation from desktop. Three 390x844 logical screens with 48px gaps on pale neutral canvas. White screens, soft gray grouped rows, restrained amber selection, system PingFang type. Respect safe areas, minimum 44x44 touch targets, no desktop sidebar or bottom app tabs.
Screen 1: title “设置”, top-right “完成”. Group 1 rows “外观与字号” value “跟随系统”, “备忘录” value “编辑日期”. Group 2 rows “设备同步” value “未开启”, “存储空间” value “1.24 GB”, “导入与备份”. All rows have restrained line icons and chevrons. Footer “备忘录和附件保存在此设备中。” No fake account or iCloud. Storage value is illustrative.
Screen 2: back “设置”, title “外观与字号”. Row “外观” value “跟随系统”, chevron. Section “界面字号”, current “小”, five equal touch choices “极小”, “小”, “中”, “大”, “极大”, select “小”. Small preview “工作项目”, “12 个备忘录”. Section “编辑器字号”, current “中”, same five choices, select “中”. Sample heading “让记录更自然”, body “把想法写下来，留给下一次灵感。” Footer “更改立即生效”. No Save button.
Screen 3: back “设置”, title “设备同步”. Status “未开启”, sentence “在你的设备间同步备忘录。” Two tappable rows “加入已有同步”, “在此设备创建同步”, line icons and chevrons. Footer “加入时，两端已有备忘录会合并保留。” No form fields before choosing an action, no fake connected devices. Leave empty space without decorative illustrations.
Constraints: coherent text, icon weights, hierarchy and comfortable touch areas. Correct Chinese. No cramped desktop fields, dashboard, gradients, phone bezels, login or invented features.
```

## 复核与迭代

生成后核对五分类、两个字号五档、完整工具栏、移动子页及未开启同步。拒绝工具新增账号、iCloud、清理、自动备份等能力。

控件拥挤时仅调整宽度或行高；中文失真时只修正指定文本；桌面工具栏缺失时只调整主窗口 chrome 与遮罩起点。保持其他布局不变，保存每轮版本与取舍，再进入实现。
