# appearance117：lh fallback 窄复核

日期：2026-11-17。复核树 `/private/tmp/cybernote-appearance117`，修复 commit `bdae5d21c3007a531a8e7b51b850225622114b1c`。开始时 HEAD 与该 commit 一致、工作树干净。

结论：**PASS。原报告 B1 / P2 的 `lh` 无回退问题已修复，可关闭该项阻断。** 本轮仅审查修复提交的三个文件及其新增 fallback 回归覆盖，不替代原报告中的其他验证边界。原报告 `docs/plan/reviews/app-appearance117.md` 原样保留。

## 修复核查

| 文件与位置 | 核查结果 |
| --- | --- |
| `src/style.css:692`、`:708` | 基础任务 li 声明 `--task-line-height:1.23em`；label 默认 margin 改用 `calc((var(--task-line-height) - var(--task-circle)) / 2) 0 0`。变量均有有效定义，回退表达式不含 `lh`，使用 WebView 91 已支持的 CSS 自定义属性、em 和 calc。 |
| `src/desktop.css:562` | 桌面任务 li 以更高 specificity 覆盖 `--task-line-height:1.65em`，与桌面编辑器继承的 1.65 行高一致；圆框尺寸与间距的已有缩放不变。 |
| `src/style.css:2289`、`:2299` | 移动任务 li 覆盖 `--task-line-height:1.35em`，与移动编辑器 1.35 行高一致；触控伪元素默认 height 为 `min(44px,var(--task-line-height))`。min 与相关变量/单位在 WebView 91 可用，表达式有效且高度大于零，不再依赖不支持的 `lh`。 |
| `src/style.css:710`、`:2304` | 两个 `lh` 增强声明均包在 `@supports (height:1lh)` 内。WebView 91 判定该条件为 false，忽略整个增强块，保留前述有效 margin/height；支持 `lh` 的引擎才使用后置增强声明。移动增强仍受原媒体规则限制。 |
| 紧凑行盒与命中范围 | fallback 变量从任务 li 继承到 label/伪元素，em 使用相同继承字号计算，与首段行盒一致；圆框中心位于首行中心。伪元素仍为 width:44px、right:0、top:50% 加 translateY(-50%)，高度不超过首行行盒，不向正文右侧扩张，也未引入 44px 方形最小高度或额外段距。嵌套任务各 li 使用同一模式局部定义变量。 |

## 回归与覆盖核查

实际执行 `node scripts/check-appearance117.mjs`，退出 **0**：

```text
PASS 742 checks (720 contrast pairs); artifacts/appearance117/result.json
```

- `scripts/check-appearance117.mjs:151` 的 declarations helper 新增 `supportsLH=false` 路径，遍历祖先并跳过 `(height:1lh)` 增强块；回退分支读取的是生产 CSS 声明。
- `:175` 起要求回退 margin/height 均存在且不含 `1lh`，并遍历所解析的 CSS，要求所有 `lh` 声明位于对应 feature guard 内；已逐项对照两个实际生产增强块。
- `:195` 起对 base/mobile/desktop 三种模式、五档编辑器字号计算生产 fallback 表达式，覆盖 **15 组首行圆框居中**；对五档移动字号进一步检查触控高度大于零、不超过 44px、上下边界限定首行，以及固定 44px 宽、right:0 和相邻紧凑行不重叠。新增内容汇总为第 742 项 check，内部断言并未单独计入该数字。
- `git diff --check` 通过。

这次通过依赖源码、CSS 条件分支与命令计算验证；没有声称实测 WebView 91 渲染或触控。该脚本仍是有限选择器/表达式检查，不是浏览器 CSS 级联引擎；本项所需的变量来源、覆盖顺序和增强 guard 已独立人工核对，无新增 blocking 或 nonblocking finding。

本轮未运行 Rust、插件测试、cargo check、浏览器、真实 App、模拟器、历史 UI 测试或其他扩大范围检查；未占用共享 Rust target。原报告中的插件 enum 单测执行空白及用户 UI 验收边界保持原记录，本次 PASS 仅关闭 B1 / P2。
