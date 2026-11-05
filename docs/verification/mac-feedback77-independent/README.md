# Mac截图修正77：独立初审

冻结源码 `806d34322abfb4cc3f55e25cef4c760748d7c842`，输入89项SHA256 `0099747b5e39c46e22c77526c866b5cd866647cc4387d317d6752241918495ac`。结论 **BLOCKED**，尚未授予完整功能/原生/像素通过。源审与独立真实App/DOM/Range/PNG探针发现两项视觉缺陷，交开发修复。所有输入保持不变；原Android/用户数据/原版删除未触及。

`blocking-layout/layout-timing.json`保留逐字符Range：正文“甲乙搜索丙丁”搜索前宽78px；搜索“搜索”后86px，匹配前和匹配后各插入4px。窄列表220px的“远处中文”摘要右边界412px，但“索”右边界423.98px，PNG只看得到“搜”。高亮textContent完整并不代表文字布局与可见性合格。两PNG通过view_image独立检查。

`initial-selector-failure`与`form-selector-failure`是独审自编runner定位器错误（旧sidebar-top；旧folder-form），自然exit1，分别完整wall12084/2180ms；已根据真实HTML更正。`lock-assertion-failure`在26项中的最后一条失败：自编runner要求锁定正文命中不能出现在结果集，此要求比任务“锁态不暴露正文且不改变既有结果集语义”更严格，暂不认定产品缺陷。前25项完成：底部入口/顶部表单、中文/大小写/重复/特殊字符/HTML字面量、无HTML执行、橙黄无色块、正文find独立、query清除、持久JSON不变、普通宽度远摘要。自然exit1，完整wall3435ms。三次pageErrors均0。尚未执行的contextmenu路径不追认为通过。

布局探针自然exit0仅表示探针完成；其`completeWallMs`计时是在openRuntime之后开始，**不能当完整进程wall**；这里只使用其布局与时序事实，不将探针exit0当产品验收通过。旧contract真实热态8次deadline有lastState；独立受控首transport140ms、deadline100ms在100.23ms抛TIMEOUT且predicate0调用/无lastState，表明“100ms超时必带lastState”断言不成立。运行时无伪造state。根已安排作者修正不成立的断言并保留截止覆盖。

根已授权开发解除旧freeze；本agent停止旧源码测试，等待新freeze。当前runner是独立证据工具；初审测试假设/定位器修正必须在复核版本记录。生产build/full desktop/mobile由开发与根按串行安排另跑，初审没有执行或重复这些写dist操作。
