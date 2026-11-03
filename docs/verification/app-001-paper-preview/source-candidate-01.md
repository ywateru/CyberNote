# 手机纸张预览：源码候选01

2026-11-03，开发源码核对；不是独立验收。隔离worktree为`/private/tmp/apple-notes-paper-preview-01`，branch `task/app-001-paper-preview`，基线`2d3bc58`。按root限定，本轮只做选择器源码、资产README与有限typecheck；未构建、安装、操作Mac/Android/浏览器或采集运行截图。因此没有本轮产物SHA、设备DPR/字体记录或运行像素结果。

## 变化范围

`src/App.tsx`显式引用已有六SVG，使用完整类型化资产映射，只有mobile且非空白项创建`aria-hidden="true"`的图案span。桌面保持原有选项顺序与渐变预览；手机按以下行序渲染，不新增可见标签：

```text
取消            横线与网格

      现有说明文字

  [空白]
  [密横线]      [密网格]
  [中横线]      [中网格]
  [疏横线]      [疏网格]
```

样式限定`.mobile .modal-paper`：禁用旧卡片全幅重复渐变，使用alpha mask、contain、center/no-repeat，图案层全卡inset0、不额外叠加SVG内嵌7单位留白。标题独立水平居中；选项留在正常文档流形成可滚动内容高度，弹层继续纵向滚动，末尾留白为24px加底部安全区。保留现有sheet顶部inset20px，未调整宿主系统区。

| 工程起点 | 以224宽录屏为单位 | 390宽换算 |
| --- | --- | --- |
| 说明line box top，相对前景sheet | 54 | 94.02px |
| 首卡top，相对前景sheet | 82 | 142.77px |
| 卡片宽高 | 74×60 | 128.84×104.46px |
| 左右留白 | 25 | 43.53px |
| 行/列gap | 26 | 45.27px |

以上仅按`100vw / 224`等比换算，不按屏幕高度拉伸。原视频224×480、源DPR未知、边缘误差约±1–2源像素。标题16px/600、取消17px、说明12px/18px、图案色#d3d0d4、圆角5px、阴影、选中outline1.5px+offset0.5px均是工程选择，不能称为高清原样恢复。

## 有限验证

- `pnpm typecheck`：最终exit0，`tsc --noEmit`通过。首次检查发现自定义CSS属性对象的`satisfies`仍受React `style`上下文约束，改用明确的`PaperPreviewStyle`类型后通过；不涉及运行行为变更。
- 源码核对JSON见`source-candidate-01.json`。已有六SVG未修改，viewBox均`0 0 74 60`。实际引用映射为`lines-small/medium/large`各7/3/2横线；`grid-small/medium/large`各7H9V/4H5V/3H3V，对应8×6/4×3/2×2完整格。
- 选纸`onClick` handler相对基线逐字节相同，SHA256 `506515411e18ed04bcb78c5703f29a0083f2874a948a15b889b81a4246badf2c`。取消仍直接调用`closePaper`；Back、弹层关闭、保存、授权、Editor生命周期处理未改。
- 六组实际纸张`.paper-context-* .drawing-node`规则相对基线逐字节相同；未改纸张模型、步长或真正笔记背景。没有依赖版本变更。
- typecheck复用主目录现有node_modules的临时软链，未安装依赖；提交前已移除软链。

## 后续验收仍待完成

运行时mask可见、七种状态/选择保存、取消和Back、窄屏滚动/安全区、FIX07选区有限回归、真实装包及同宽度比例截图对照均unknown/not-run。主题、原设备字形、精确颜色、动画与全页像素仍unknown；本记录不替代独立verify报告。后续不得将录屏纵向拉伸以消除屏幕比例差，系统区域须单列。
