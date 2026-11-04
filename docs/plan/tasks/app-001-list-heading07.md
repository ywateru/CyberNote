---
id: app-001-list-heading07
scope: mac-native-three-column-title-and-first-date-section
status: in-progress
---

## 目标与依据

继续用户Mac UI完全一致目标，修复准确06实测的普通标题上4px/计数下2px、首组今天上8px且字高偏大。以docs/ui/macos.md末节与research/mac-list-heading-readiness07为契约，不声称整窗PASS。

## 修改范围

产品只允许plugins/tauri-plugin-notes-ui/macos/toolbar.m与src/style.css。原生layout仅三栏title/count改统一y11/27；保留13/11字号、所有x/width、zero textX−1、其他布局y9/28和对象身份。CSS仅desktop.native-toolbar普通列表首个note-entry的直接date-section覆盖font15、line20、height40、top9、bottom border.5，其余左右padding保留。排除gallery-browse/gallery-edit/separate，手机/浏览器/后续group/zero均不动。不要改数据、导航、菜单、搜索、动作、协议、依赖或真实编辑器。

## 开发和复核

作者与复核必须分开。复用有限生产layout检查和严格ObjC/controller13/pnpm build，检查统一基线及非三栏/zero/侧栏隐藏恢复保留；真实WebKit渲染今天同文前后以测字框和组底，不能只断言CSS常量。若正式原生WebKit不可独立跑可记录候选再准确新包root GUI，不拿Chrome当WK。必要输入/输出冻结hash与原始失败保留，不再为这两处增加庞大同构fixture。

本轮作者不GUI、不ADB、不平台build、不stage/commit、不改共享target/cache。root准确出包前经不同作者独审，随后实际新包与原版同文对照。像素残差继续open；此任务仅是全目标的一步。

## 真实WK量图后的作者候选修订

原版160阈值57×28/y130；15候选56×27/y130；15.25候选57×28/y129；15.5过宽58×28/y129。采用15.25px与padding-top9.5px，支持尺寸及纵向各补1图像像素，保持line20/height40/border.5与主题色。不开固定灰色以损坏深色，披露普通浅色clone38/原版41残差。作者仅再验证最终候选真实WK同文，不继续无限字号扫描。前面的15/9作为起始方案保留，本节为当前实现契约。
