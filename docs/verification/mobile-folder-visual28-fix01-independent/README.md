# mobile-folder-visual28 fix01 独立证据

结果：有限命中修复 PASS，原 P2 关闭，READY STOP。正式结论见 `docs/plan/reviews/app-mobile-folder-visual28-fix01.md`。

- `input-initial.json` / `input-close.json`：98 个去重保护输入的开始和终末字节数、SHA-256；原证据及产品未修改。
- `identity-checks.json`：98 项初始身份断言。
- `independent-fix.patch` / `static-checks.json`：唯一 CSS 差分及 9 项有限静态检查，包括作者三组封存截图解码零差与失败记录保留。
- `check-hit.mjs` / `app-command.json` / `app-result.json`：生产 App 与完整 CSS 的独立坐标点击，10 项断言全过；退出 0，stderr 为空。
- `mobile-current.png`：本轮模拟移动视口截图。
- `result.json`：范围、源文件身份和结论；`evidence-index.json`：仓库根目录相对路径索引，包含新报告。

只完成 CSS 命中问题和局部视觉保持的独立验证。模拟宿主为 macOS Chrome，不能代替安装后的 Android 或原生系统交互和全像素验收。作者 0.25 px 外边界失败及基线同类行为保留，独立外 1 px 点击未误触发。旧七例及类型检查未重跑；旧独立阻断报告和索引未改。

`vite-cache/` 为本轮专用生成缓存，保留但不纳入证据索引。索引仅覆盖本目录顶层证据文件及新报告，不递归缓存。
