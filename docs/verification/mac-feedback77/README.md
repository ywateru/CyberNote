# Mac截图修正77开发证据

当前冻结为 `f7b3c94486bcc870620f1ac46a100be8abe3b607`（产品修复 `e760ece7`）。开发完整桌面148项及手机95项已通过，独审正独立复核；不代表整窗原生像素通过。基线 `ad12447963ce648f9fbaff5e411bce91a6b930bb`，首轮 `806d3432` 的失败与修复过程完整保留如下，最新回归见末节。

## Before

`before/state.json`、`before/context-menu.png`、`before/snapshot.json` 是修改前真实App/合成数据/鼠标右键复现：用户指针 `(318,123)`，列表行 `(238,103,259,75)`，菜单却固定到 `(1012,52,248,291)`；Mac底部新建文件夹按钮1个、列表命中span 0个、pageErrors为空。

原版与用户标注已由根保全到 `references/macos-feedback77`。原版PNG含Display ICC，局部主体橙色经ICC转sRGB为 `#fcb828`，本轮采用该字色且透明背景。参考截图未打开菜单，无法证明原版菜单精确几何，更不称整窗像素一致。

## 定向开发过程

- `develop`、`develop02`：在边界合成事件测试中失败。Playwright `dispatchEvent('contextmenu', options)` 的普通Event未携带clientX/Y，走了正确的键盘fallback；测试改为显式 `new MouseEvent`。真实中部/滚动/画廊右键一直使用浏览器鼠标事件。
- `develop03`：Unicode query `x` 也匹配既有Fixture B摘要 `text`，测试将所有行误当成A行；修正为限定 `data-note-id=note-a`，没有更改结果集语义。
- `develop04`：首轮41项通过。
- `develop05`：加强直接note→toolbar菜单切换及220px高窗口约束后42项通过；旧失败原始快照/PNG/结果全部保留。

产品将上下文菜单切换时的inline几何清理，避免复用DOM导致toolbar更多菜单继承旧坐标。全局高亮沿用原结果集的locale-lowercase字面量匹配，映射Unicode扩长位置回原字符串，以React文本节点输出；摘要向首个匹配处取上下文。手机入口与既有显示保持。

## 冻结806d回归

精确来源、命令自然exit和完整wall见 `frozen806d/result.json`，对应输入指纹 `0099747b5e39c46e22c77526c866b5cd866647cc4387d317d6752241918495ac`。

| 验证 | 结果 | 完整wall |
| --- | --- | --- |
| pnpm build | 自然exit0 | 2.995s |
| production排除 | 自然exit0 | 1.014s |
| desktop all第1次 | contract首项失败，0检查 | 2.766s |
| desktop all第2次 | 同断言失败，0检查 | 2.555s |
| desktop其余9组 | 98项，自然exit0 | 45.932s |
| mobile notes | 9项，自然exit0 | 4.194s |
| mobile recording | 43项，自然exit0 | 10.557s |
| mobile attachments | 43项，自然exit0 | 19.402s |

两次all在既有 `State polling awaits false async predicate until real timeout with last state` 的100ms断言处退出，产品组尚未开始；与上一任务已记录的同一断言相符，但原因未在本轮确证，不归因于并发或产品。为完成其余回归，临时编排 `run-noncontract.mjs` 原样运行生产runner中的其余9组，非全组142通过。失败现场和日志保存在各rawOutputs目录，已复制紧凑结果/失败PNG/快照到 `frozen806d/attempt1`、`attempt2`。首次失败没有完成正常summary，不捏造其pageErrors统计；成功production、其余9组和手机三组均pageErrors为空。

## 独审待处理

根与开发静态检查指出 `.snippet-text` 既有flex/gap4会将新增命中span拆成独立flex项，可能改变字距；当前42项尚未包含连续字距与ellipsis断言。产品保持冻结等独审实测，若阻塞须解除冻结后修复并重新回归。不能把本轮通过的文字/色值/范围断言扩张为字距像素一致。

所有场景只操作隔离合成数据，IPC/原生窗口/设备为明示fixture；不证明Rust、Tauri原生窗口/系统右键或实际手机。不启动原Android现场、不读取用户录音、不做原版删除实验。本次没有Rust/依赖/锁文件修改或新安装包。


## 独审阻塞修复与当前冻结

独审首轮阻塞证据提交 `2ded802b`：flex/gap确实使「甲乙搜索丙丁」从78px变为86px；220px列表中首命中后半字被裁。产品 `e760ece7` 将非锁摘要包入一个正常inline排版容器，锁图标外层保留；测量该容器与首匹配的实际rect，前缀占位造成首命中不完整时去掉前缀、保留省略号和后文。宽度改变由ResizeObserver重新计算，280px恢复六字前文、220px再裁短，无数据改写。`mac-feedback-search-geometry.json` 记录逐字Range坐标、窄/宽/再窄文本与边界；前后文字总宽都是78px，字符相邻无新增空隙，所有47项以及pageErrors检查通过。

测试 `f7b3c944` 修复既有contract不成立的100ms假设，运行时算法完全不改。真实App异步false改为合理750ms预算并仍要求实际回调和已观察lastState；单独受控200ms首次transport/50ms截止检查正确TIMEOUT且无lastState、无谓词调用、transport尚未结束。late true/never采用立即可达的受控state确保真实进入谓词后验证deadline；保留真实App延迟true、stalled transport、错误封装等旧检查。最终 `contract-deadlines.json` 有实际测量，不能将这种受控transport混称原生持久化。

`revision01` 是新增字符测量测试baseline未限定noteA，遇2个snippet-copy触发strict locator错误；已限定目标行，失败原始快照保留。`revision02` 定向47项、`contract-revision01` 定向45项通过，随后提交产品和runner再跑以下全套。

| 当前冻结f7b3验证 | 结果 | 完整wall |
| --- | --- | --- |
| pnpm build | 自然exit0 | 3.026s |
| production排除 | 自然exit0 | 0.918s |
| 完整桌面十组 | 148项，自然exit0 | 47.382s |
| mobile notes | 9项，自然exit0 | 4.339s |
| mobile recording | 43项，自然exit0 | 10.234s |
| mobile attachments | 43项，自然exit0 | 19.261s |

精确命令、源码、检查及快照见 `frozen-f7b3/result.json`、各组summary/suite。冻结输入89文件指纹 `b4d046b7945f3d1422ffe095fd04cc67671f7e5989ebb194293fb90dc521182a`，所有CLI summary输入前后相同、生产排除/桌面及手机三组pageErrors均为空；原始所有日志/截图/快照保留 `/private/tmp/mac-feedback77-frozen-367`。这里只复制紧凑结果及本次Mac截图，未清理旧失败记录。构建保留既有Vite大chunk提示，无新增Rust或依赖变化。
