# Mac截图修正77开发证据

基线 `ad12447963ce648f9fbaff5e411bce91a6b930bb`；第一轮冻结产品/runner `806d34322abfb4cc3f55e25cef4c760748d7c842`。本页记录首轮开发与回归，独审尚在进行，不代表任务最终通过。

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
