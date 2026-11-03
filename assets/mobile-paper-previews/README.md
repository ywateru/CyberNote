# 手机纸张选择器图案

六个独立、透明、单色 SVG，来自 `docs/research/mobile-paper-calibration/` 的有限离线测量与规则化。仅供手机“横线与网格”选择器的预览层；不用于真正的笔记/绘画纸张，不决定纸张实际间距。`src/App.tsx` 已接入六个资产的源码候选，仅在 mobile 选择器分支渲染；尚未构建或装包验证，不代表页面或像素验收通过。

| 文件 | 水平线 / 垂直线 | 完整格数 | 线中心范围（viewBox单位） |
| --- | --- | --- | --- |
| `lines-small.svg` | 7 / 0 | — | x7–67；y7.5–52.5 |
| `lines-medium.svg` | 3 / 0 | — | x7–67；y15–45 |
| `lines-large.svg` | 2 / 0 | — | x7–67；y15–45 |
| `grid-small.svg` | 7 / 9 | 8×6 | x7–67；y7–51 |
| `grid-medium.svg` | 4 / 5 | 4×3 | x7–67；y7–51 |
| `grid-large.svg` | 3 / 3 | 2×2 | x7–67；y7–51 |

所有文件 `width="74" height="60" viewBox="0 0 74 60"`。图案内嵌留白已在SVG内，不要再为线条额外加一层7单位padding。网格中心框为60×44，疏格单格30×22，刻意保留长方形比例。只用显式line，不使用重复pattern，因此末尾格数不依赖小数背景重复。

图案只有不透明黑色stroke和透明背景，`stroke-opacity="1"`，不含白底、卡片圆角、阴影、选中边、勾、文字或触摸区域。它适合CSS **alpha** mask：页面提供颜色，黑色RGB不参与最终着色。若使用标准CSS `mask-image`，明确 `mask-mode: alpha`，不要使用luminance模式；黑色亮度为零会使luminance遮罩不可见。

线宽固定为 **0.45 viewBox单位**，随图案等比缩放。在74×60显示尺寸为0.45px；按源宽224映射到390宽、卡宽128.84时约0.78px。它是工程起点，不是从压缩录屏恢复的高清线宽；原设备DPR和精确RGB/alpha仍未知。不使用 `vector-effect="non-scaling-stroke"`，使线宽与图案一同缩放。

## 宿主接入

Vite可以从`src/`引用根目录资产，例如：

```ts
import linesSmallUrl from '../assets/mobile-paper-previews/lines-small.svg';
import linesMediumUrl from '../assets/mobile-paper-previews/lines-medium.svg';
import linesLargeUrl from '../assets/mobile-paper-previews/lines-large.svg';
import gridSmallUrl from '../assets/mobile-paper-previews/grid-small.svg';
import gridMediumUrl from '../assets/mobile-paper-previews/grid-medium.svg';
import gridLargeUrl from '../assets/mobile-paper-previews/grid-large.svg';
```

宿主使用类型化的六资产映射，把所选URL写到`aria-hidden="true"`的`.paper-preview`层的`--paper-preview-url: url("…")`。只有 mobile 且非空白项创建该层；桌面维持现有预览。实际CSS位于`src/style.css`的`.mobile .modal-paper`范围，采用以下遮罩方式：

```css
.paper-preview {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-color: var(--paper-preview-color, #d3d0d4);
  -webkit-mask-image: var(--paper-preview-url);
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-image: var(--paper-preview-url);
  mask-mode: alpha;
  mask-position: center;
  mask-size: contain;
  mask-repeat: no-repeat;
}
```

预览容器应保持74:60比例；`contain`保留长方形格子比例。若宿主容器比例不同会产生额外留白，须调整宿主布局，不要纵向拉伸SVG。示例色`#d3d0d4`也是待实机校准的起点。空白选项直接不放图案层，无须第七个空SVG。

宿主继续负责白卡、阴影、选中状态、按钮可访问名称/选中语义、触摸尺寸与交互；图案层应`aria-hidden="true"`。对每个资产的引入只替换选择器预览，不改真实纸张模型或步长。

当前手机布局按行排列为空白独占首行，随后密/中/疏横线与相应网格成对；无可见卡片名称。卡片74:60，侧留白25、行列gap26，均以`100vw / 224`作单位。说明line box top为54单位、首卡top为82单位，均相对前景sheet顶部；390宽时分别约94.02px、142.77px，卡片128.84×104.46px、gap45.27px。这些是低清录屏的工程测量起点，不是原设备CSS尺寸。标题在sheet水平独立居中；网格留在正常文档流，沿用弹层纵向滚动，并保留24px加底部安全区的末尾留白。字号、行高、颜色、阴影、圆角与选中边均待真实页面对照；没有高度拉伸以匹配224×480录屏。

原选纸保存、取消、Back/恢复选区的处理逻辑未改；源码核对及有限typecheck记录见`docs/verification/app-001-paper-preview/source-candidate-01.md`。运行时遮罩可见、七状态保存/取消、窄屏滚动、安全区、选区回归、主题与像素比较仍未测，须由后续真实装包验证完成。

## 离线核对

运行 `python3 docs/research/mobile-paper-calibration/preview-assets/prepare.py` 可重建资产、8×透明PNG、联系表和自查JSON，使用已有ImageMagick与Pillow，不安装依赖。详情见 `docs/research/mobile-paper-calibration/preview-assets/README.md`。源码候选已通过`pnpm typecheck`；未运行浏览器/CSS mask、真实装包或GUI，源码接入须另行验证。
