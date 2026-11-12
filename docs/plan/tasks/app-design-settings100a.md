---
id: app-design-settings100a
scope: interface-settings-contract
status: done
depends-on: [app-build-delivery97]
---

## objective

源码基础范围完成：作者b0f64d90，F1由4a49a633修复，独立9196b4fd接受并按c06d08e1基线差异回填。局部ACK期间最新外部配置归并已验证；全局控件/层级与App保存排序回滚仍100必做。

在不修改主组件、媒体消费或原生工具栏的前提下，先建立界面细节设置的类型、共享变量映射、持久验证与双端设置入口。该阶段只交付配置边界和设置页；DESIGN100 仍负责将变量应用到所有真实产品控件、消除覆盖并验收整体层级，不能用示例预览代替整项完成。

## context

docs/ui/design-rules.md 是配置范围、默认值、旧配置兼容、系统限制与布局的唯一来源；docs/ui/preferences.md；docs/architecture/application-modules.md；docs/plan/tasks/app-design-rules100.md。

## path

新增 src/interface-details.ts（有界设置及CSS变量映射，可选择同等明确命名）、src/types.ts 的可选兼容字段、Preferences.tsx/CSS 的折叠控件与实时示例、src-tauri/src/store/archive.rs 的设置导入/更新校验及相关真实Store测试。允许新建独立设置测试脚本。禁止修改 App.tsx、Editor、Menu、style.css、main.tsx、bridge、data-management、媒体模块和原生toolbar，避免与 MODULES98/MEDIA99 并发冲突。必要的最终全局应用仅在100阶段接线。

## verification

- 界面和编辑器的原有五档字号保持；新增图标倍率、按钮命中倍率、菜单间距与圆角配置严格遵循设计范围，移动44px下界在映射中明确。原始z-index不向用户暴露。
- 真实Preferences通过原持久settings接口保存、失败保留旧值并提示、重载后恢复；重置仅细节字段。旧配置缺字段明确默认，未知版本/键/非有限/越界在前后端均拒绝，不静默截断。
- 真正Rust Store归档导出/导入保留合法字段，非法导入不修改原数据。测试用隔离Store，不修改用户库。
- 桌面与320/390px移动的明暗主题、展开/收起/极值输入/键盘操作无溢出；系统AppKit限制在界面说明。
- 提交后由不同代理独审；交付说明明确真实产品控件应用尚待100，不宣称整体设计规则完成。
