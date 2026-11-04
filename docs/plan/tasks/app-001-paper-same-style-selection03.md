---
id: app-001-paper-same-style-selection03
scope: first-current-paper-option-editor-and-selection-ownership
status: in-progress
depends-on: [app-001-paper-rounded-selection03]
---

## 问题与现有契约

手机纸张返回已有契约要求同笔记、同选区及可继续编辑，不借重新创建Editor绕过。纸张顺序旧新真实App检查均观察到首次点击已选plain后PM选区3..8变1..1。rounded03作者进一步记录同一步真实Editor/View/DOM身份变化，原失败必须保留。这个交互缺口不能因选框CSS对照通过而忽略。

## 授权实施

rounded03仅CSS候选固定并交不同作者独审后，串行处理本任务。先用现有真实App/Tiptap完整链定位首次进入/选择当前样式时的父key/Editor recreate来源，追踪openPaper→选择→patch/doAction→flush/存储ACK/hydrate→closePaper；明确刷新的是外部正文还是自身无操作/metadata，不能假定是任意hook错误。

同一已选样式选择应关闭纸张页、键盘隐藏，恢复原bookmark且不产生无意义纸张写入或重建编辑器；可用最窄已有边界避免无变化patch，但必须同时证明其他样式保存、外部真实正文/锁态变化不会被错误跳过。若根因超出无操作patch，修真实归属/同步边界，不通过清空pending、revision或强制复写document保持假稳定。范围优先src/App.tsx现有paper handler和必要共享保存接缝；不改Rust/schema/依赖/其他导航，超范围先报告root。

## 验证

真正App和Editor非替身：初始当前plain首次选择、第二次同选plain、非plain当前再选自身、plain↔grid-large、取消/Back，记录父key和Editor/View/根DOM/全文/PM选区/undo历史；同样旧输入先复现原失败，再候选运行。使用真实Store与已安装应用需要平台build另行root授权；浏览器设施仅受控源码链证据，不称Rust或APK通过。保留待ACK正文、外部正文变化与访问失效的守卫，至少以现有生产测试复用验证安全分支，不写仅镜像if常量的测试。

pnpm build及必要针对检查；作者不GUI/ADB/平台build/共享target/cache，不下载升级，≥2GiB。不同作者独审后与已审圆角候选统一准确APK，实机首次同样式选择/输入续写/正常重开验证。无原版触点证据的部分标工程契约，不伪称录屏实采。禁止stage/commit他人活跃文件。

## 源码候选与独审03

App 6eff8e958057e79fa9968a5e89e936197a78567b1e1e58c101e2e99f74671fd4两处接缝已由不同作者SOURCE-READY，报告 `../reviews/app-001-paper-same-style-selection03.md`。原预览创建响应无access、首次纸张刷新触发undefined→epoch0的严格清理，是实际复现根因；原生创建自带access，不将预览失败追认为Android故障。候选同样式仅closePaper，预览缺access先可信loadWorkspace，未放松原清理守卫。独立旧两条失败、候选8次选择/8条关闭、两组pending ACK/真实undo redo、identity30/保存安全21/build通过。Back仅原处理器，pending仅预览action执行前hold，均不冒称系统输入或durable写后丢ACK。仍待准确新APK实机验收。
