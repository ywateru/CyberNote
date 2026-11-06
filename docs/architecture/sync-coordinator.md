# 同步安全应用的窗口协议

2026-11-06。约束来源为[sync](sync.md)的quiet两阶段屏障；本文件固定Rust适配器与前端接线的共同协议。网络receive只持久inbox，以下事件仅本机窗口协调，不走peer socket。

## 创建和调用链

Rust惰性同步服务收到inbox后调度本机coordinator；真实document_participants集合由AppHandle取得。coordinator先probe，再调用84 plan，最后prepare/短gate/apply/release。前端App挂载独立监听器并接入现有真实editor/保存队列/录音ticket/picker/创建和退出状态。业务授权notes-access屏障继续独立，不能拿它替代本协议。

本机事件名`notes-sync`，payload采用严格tagged union：

```ts
type SyncWindowEvent =
  | { phase: "probe"; operationId: string; sessionId: string }
  | { phase: "prepare"; operationId: string; sessionId: string; noteIds: string[] }
  | { phase: "release"; operationId: string; sessionId: string; outcome: "commit" | "abort" };
type SyncWindowReply =
  | { phase: "probe"; operationId: string; protectedNoteIds: string[]; blocked: boolean }
  | { phase: "prepare"; operationId: string; ready: boolean };
```

前端通过`invoke("sync_window_reply", { reply, expected: accessGate.expected() })`回复，返回`{operationId, outcome:"pending"|"abort"|"commit"}`作为本机线性化收据；事件发出前后expected可能变化则拒绝并abort/reprepare，不能删除token检查。Tauri取真实window.label，校验本进程sessionId、操作ID、phase与预先捕获participants，拒绝伪造/未知/越阶段reply和unknown fields。ready:false是已ACK参与者允许的取消信号，需在同一短gate内标记abort并返回终态收据；已完成的同一操作可对其原参与者幂等返回有限保留的终态，不能当成新操作。前端只接受当前可信sessionId对应事件；旧operation的release不能释放新freeze。operation ID来自本机随机UUID。probe与prepare等待各自有5秒上限，收到blocked/not-ready即abort，release已通知窗口；超时保留inbox并在自然安全点/有界退避再试，不忙循环。

metadata与授权变更仍走已有`notes-metadata`/必要`notes-access`可信事件，不把未经gate的snapshot混入reply。成功apply后先发布实际Store commit metadata/必要授权，再release；abort不发伪成功metadata。参与窗口增删或Session变化均abort，所有状态释放属于自己的operation。

## 前端约束

probe报告真实PM composing/TagComposition.pending、活跃录音ticket直到最终ACK+release的owner、picker/附件在途owner；创建/退出/既有access barrier或未就绪可信workspace为blocked。probe不改editable、不flush、不停止录音。prepare重验上述状态，目标安全时短暂freeze其editor/native/toolbar/keyboard写入口，保持实例/DOM/selection/Undo；排空已登记保存与pendingDocs并确认失败为空才ready。prepare后若navigation、composition或任何owner改变不能继续声称已冻结：本机直接回复ready:false（允许已ACK后的取消信号，coordinator在commit前必须再检查），维持目标写入freeze直到收到对应release或终态收据。不能发送异步cancel后立刻重新允许写入，否则cancel尚未到Rust时可能发生apply覆盖未保存按键。导航等目标变更先等待该终态，再继续原动作；IPC丢回复时保留freeze并安全重取本机终态/可信workspace，不用前端定时器无条件解冻。其他编辑器可以继续工作。probe/prepare/abort自身不得重挂实例。远端确实替换正文的目标可沿用现有hydrate/externalVersion更新机制；正文相等的普通metadata以及无关笔记不得因revision变化就重挂，保留其DOM/焦点/Undo。被替换目标的本地输入必须已flush并由84保存对应版本或冲突head，本版不另定义远端正文的Undo合并语义。

release只恢复当前operation保存的旧editable/焦点，不抢别的页面焦点。恢复前重验当前可信授权、noteEpoch与editor owner；远端已锁定/删除或实例归属已变时继续受现有授权gate限制，不能用旧editable=true重新开放。组件unmount/窗口销毁同样释放；后端最终gate重新检查真实participants和目标intents/access pending以及84 generation/targets。网络IO与等待不持Session mutex。无窗口headless显式调用apply仅用于真实无窗口测试进程，生产app不能因暂时没有reply就降级直写。

协议允许在正式生产接线前为明确调试fixture注入事件；该层不证明真实Rust。最终86/87必须两个真实App DOM各接独立Rust transport，观察事件和实际数据库，并验证A录音中B更新及B锁定删除、A本身更新延后、PM组字settled、picker/最终ACK、窗口增删和stale计划。
