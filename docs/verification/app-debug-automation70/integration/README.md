# Task70 主工作区整合结果

2026-11-05。**PASS：一条命令完整执行九组、91项检查，全部通过。** 本页对应主工作区的一次实际运行，不拼接先前分组结果。

## 源码与环境

- 开发提交`8deeb87b97ed2d8f186413a610778984320c711b`已fast-forward合入；独审`a78f23b0`以`c2b45b42041fedf7a0d4347100417557bd70d417`合入。此次执行HEAD为`c2b45b42`。
- 77个源码/测试/配置输入SHA256：`0e632a7ccb9c92a49d9f13bb989a9b3cd5bf400de481769f2e0f0de49b6bcfe0`。suite与生产检查起止一致，`gitDirty=false`、`sourceInputsChanged=false`，与作者最终输入匹配。
- Chrome `156.0.8078.80`，桌面viewport 1280×800。独立合成工作区，后端`isolated-js-protocol-fixture`，媒体为固定440Hz PCM/WAV设备边界；真实App、Editor、SaveQueue、Panel、Session、累计PCM、AudioContext解码及正文ACK参与。

## 实际整合检查

| 检查 | 结果 | CLI计时 |
| --- | --- | --- |
| `pnpm test:debug`，完整九组 | **91 checks PASS**，exit0，pageErrors 0 | **27.369 s** |
| `pnpm build` | TypeScript及生产Vite构建成功，exit0 | Vite阶段1.85 s |
| 刚构建dist的`check-production` | 全局API不存在、URL不能开启、debug/fake标记匹配0，exit0，pageErrors 0 | 5.554 s |

CLI计时在最后资源清理前采样，包含启动与场景，不是整条shell进程或独立硬件基准。正常浏览器/服务/临时缓存清理已结束，两个CLI进程均exit0。前端构建与全组检查并行启动，此处为本次环境实测，不提供与Computer Use的虚构倍数对比。

| 分组 | 通过项数 | 场景耗时 |
| --- | ---: | ---: |
| 接口、参数、快照比较与idle | 38 | 6.645 s |
| 笔记、锁、恢复与确认删除 | 9 | 1.850 s |
| 普通/智能文件夹 | 8 | 1.335 s |
| 编辑、格式、撤销重做、表格 | 6 | 0.718 s |
| 搜索与标签 | 4 | 0.599 s |
| 设置、纸张、侧栏、绘画入口 | 5 | 0.467 s |
| 附件与OCR | 5 | 0.952 s |
| 归档 | 2 | 0.334 s |
| 录音 | 14 | 4.334 s |

录音检查包含A录音/B编辑、暂停试听、两次累计保存、单卡原位替换、存储失败重试、真实累计WAV非空/时长、模拟关闭/退出及正文ACK，以及迟到checkpoint失败明确APP_ERROR、恢复后引用最新音频并释放owner。旧committed媒体保留供Undo，物理文件数量不与可见卡片数量混淆。

## 使用与证据

```sh
pnpm test:debug --out /private/tmp/notes-debug-result
pnpm debug group recording --out /private/tmp/notes-debug-recording
pnpm debug group notes --mobile --out /private/tmp/notes-debug-mobile
pnpm debug list
```

[完整summary](summary.json)含本次逐组91项断言、环境和源码身份；[catalog执行矩阵](catalog-coverage.json)逐项区分executed/not-exercised/unsupported；[生产summary](production-summary.json)记录刚生成dist的排除结果；[整合result](result.json)还保存生产文件SHA256。只复制必要JSON，没有复制截图、全量HTML、缓存或用户音频。

[开发收尾](../development/README.md)另记录音14项、390×844手机笔记9项和生产检查；[独立复核](../independent/README.md)记录八门槛、目标/授权变化反例、实际App卸载清理、CLI非法参数及旧失败修复。`9c72`的旧全组末项断言失败仍保持历史失败，本次才取得完整单命令成功。

## 通过范围

命令目录有67项（54语义、3 DOM、10明确unsupported），可达性不等于每项功能均已执行。系统IPC、文件对话框、OCR提供者、剪贴板和关闭/退出为明确模拟；默认JS协议后端不证明Rust Store持久化。手机浏览器不等同Android WebView/IME；真实硬件、OS权限和退出、麦克风音质仍按实际平台验收。Apple Notes没有HTML，原版录屏/截图继续作为人工视觉参考，本次不授予原版整体像素一致结论。

任务70在这一声明范围内完成，使用说明见[统一调试入口](../../../debugging.md)。
