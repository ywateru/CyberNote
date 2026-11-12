# Video recovery107 独立审查 — accepted / source-ready / native-open

**2026-11-11 F1复审：下方首次reject保留为历史；文末所核四行修正已接受，F1关闭。当前结论为source-ready / native-open，不代表冻结106包含本改动或原生卡住根因已修复。**

首次审查历史（2026-11-11）：候选暂不接受，唯一阻塞为**已加载source首挂载时StrictMode effect重放清空src且未恢复**。产品未自修，交回原作者窄修。审查使用保存exactbefore，不使用大dirty HEAD diff；无Rust/原生包/设备/大原件操作。

五项当前文件长度/SHA及两项保存before SHA均匹配作者after-manifest；22007B patch SHA`4f6bb71d768860982239888b56b30b5da7a81dd9c5af8c1656ed9519c72a8834`匹配。独立记录`artifacts/video-recovery107-independent/check.json`。新文件历史不存在沿用作者保存记录，不由当前缺失单独反证历史。

## F1 精确复现与修正边界

`src/main.tsx`确有React.StrictMode。`src/VideoAttachment.tsx:57`的setup取得有效source/element后直接设置activated并绑定事件/controller，却不再像保存before的MediaView一样核对并恢复`src`；cleanup的`unbind()`会执行pause、removeAttribute("src")及load。StrictMode同元素setup→cleanup→setup，React的同值JSX属性不会因这次清理自动重新赋值，造成有效source对应的活元素空src。

唯一有疑点后追加的真实组件小验证：`node artifacts/video-recovery107-independent/strict-probe.mjs`，session47186 exit0，finally等待原runtime cleanup。TSX实际import候选VideoAttachment和生产managed source，以已有191755B clip创建source，已加载source直接首挂StrictMode；未镜像组件实现或改产品。结果`strict-result.json`：connected=true、sourceDisposed=false、attribute=null、readyState=0、networkState=0。currentSrc残留旧blob字符串，不能据此当作仍有有效src或播放成功。独立工具/raw SHA在同目录review-manifest。

最窄修复是在受现有enabled/owner/source/disposed门禁保护的setup中恢复当前source赋值，同时保留cleanup真实停播/移除src及撤权逻辑。不要去掉StrictMode或弱化清理。修后同小probe应保留有效src并取得真实ready/playback；继续保证owner取消、晚事件及撤权不被恢复赋值绕过。原App异步获取通常先source=null，作者8check没有覆盖该组件首挂边界，不能以其绿色排除此问题。

## 其余已审范围与限制

其余源码检查未见新增阻塞：本地retry递增版本经原hook/pool换源；owner identity排除本地retry但包含附件字段、原池失效以及session/note epoch；latest owner/enabled、live/token/disposed/ref共同拒绝旧事件及play rejection。owner/失效变化清pending，source controller仍同步停播并卸载；没有后端TTL/权限变更，音频分支未改。有限位置仅在duration/seekable允许时设置；seeked差异、无法恢复及play rejection有可见反馈，不自动循环。

保留作者真实Chrome八check、HTTP404/MediaError、显式新URL和trusted0.8秒seeked证据：小JSON独核确认新URL与替换元素seek事件相同，随后time1.015193/paused=false。脚本实际使用App与HTMLVideoElement；旧元素事件为刻意负例注入，取消/invalidation使用延迟acquire与原pool事件。脚本首次失败是obsolete selectedNoteId断言，原失败保留。未将作者执行冒称本审重新运行；本审只运行上述新增StrictMode精确probe。

Chrome runtime设置no-user-gesture-required并mute，HTTP404为小fixture显式服务，不等于真实Rust TTL过期，也不证明Mac/Android原生重试/声音或原Mac卡住根因。F1修正前不接受107源码交付；冻结106包及原102/原生媒体待验边界不变。现释放候选给作者，不扩测试矩阵。

## F1四行窄复审 — accepted，source-ready / native-open

最终VideoAttachment为7000B、SHA`3c8453b4761acbbe85376db1f83f00634f33786e676ed2e05831eea59f57f2db`。与保存candidate-before-f1/VideoAttachment逐字比较，恰仅新增两行解释和两行`if (valid() && element.getAttribute("src") !== source.src) element.src = source.src`。其余源码字节不变；setup在绑定controller后恢复live source，依旧受原live/token/enabled/owner/disposed/ref门禁保护。原cleanup的pause/removeAttribute/load及unbinding原样保留，撤权或失效source不能借此重新挂回。

504B incremental patch SHA`5e41fb4039c9a5f5ecebfa145f173b44d1a318da8f2399bcfe6c2e1c27cd352a`及最终五文件长度/SHA全符。旧candidate组件SHA`5a18d1dd…`和旧独立失败strict-result SHA均保持。未覆盖原失败。

本审独立执行同一原StrictMode实际组件probe，仅输出路径更换为`after-f1-independent/strict-result.json`：`node artifacts/video-recovery107-independent/strict-probe-rereview.mjs`，session92509 exit0，finally等待cleanup完成。live source、attribute、currentSrc三者一致，readyState4/networkState1、connected=true/sourceDisposed=false、reproducedMissingSrc=false。TSX probe未改，不新增组件测试矩阵或原生测量。详见同目录`check.json`。

已有受影响八项真实App/视频回归保持8check、0errors；新结果中trusted seeked仍关联替换URL的0.8秒，播放随后推进。最终typecheck exit0为作者session43224记录，未冒称本审重复执行。以精确四行差异、独立同probe和保留局部回归证据，关闭F1并接受107源阶段候选。Chrome策略、模拟HTTP404、Rust/native未验、原102开放及原Mac stall原因未知等原限制不变。释放工具/源码，不追加宽测、包或设备动作。
