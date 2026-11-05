# 第三版Quit：有限原生静态复核

源码固定 `1b47c8025f3df5b43d85561566fd7ab381096820`，比较基线 `8e061891cb56a404bb3ec68baafe0e587d0afa67`，合同固定 `b2242584ba36e26dc1ad6a43f68cfb936ea0b790`。只用git读取最终`recording_window.rs`、`lib.rs`、4个capability以及与最终52标签契约的比较；没有读取renderer或作者可变工作树，没有修改产品、构建、测试或GUI操作。前两轮报告和结果文件保持原样。

结论：**固定1b47c802仍有已知重复退出绕过阻塞，不能source-ready**。总独审运行发现后，root通知本补审；复核428–433行可直接确认相同控制流。本补审此前的“未见新增阻塞”初步消息漏了重入时的早返回顺序，现以本记录更正。没有将他人实际复现算作自己执行的测试。

具体条件：已有Quit仍在等某个正文窗口ACK，但录音entries已清空。第二次ExitRequested在428–429行因`entries.is_empty()`直接返回，尚未执行431行`prevent_exit()`或432行`quit.is_some()`检查。因此待确认正文的退出保护可以被第二次请求跳过。修复须确保已有pending Quit的重入请求仍先prevent_exit，不能用“录音已结算”代替“正文ACK已齐”。作者正在窄修，需对新固定源码再复核。

其余下表只记录局部源码观察，不构成该源通过结论，也不证明首次await前的前端写入冻结、取消ID匹配、实际窗口生命周期、收音或完整退出运行验收；这些仍由总独审与真实验收负责。

| 原生边界 | 固定源码推导，行号为recording_window.rs |
|---|---|
| 退出快照 | `Quit`27–30行分开保存不可随ACK缩小的participants与waiting；435–440行在发退出通知之前生成UUID id并保存两份初始集合。 |
| 真实ACK身份 | command使用注入WebviewWindow；319–321行先核当前Quit id与实际caller仍属于waiting，旧轮ACK、重复ACK、非参与窗口不能解除guard或取消新轮。 |
| 新增/移除参与窗口 | 成功ACK329–333行先比较当前完整文档集合与原participants，任何标签集合差异取消本轮并返回错误，不能把旧ACK套给新集合。Destroyed403行也再次比较；396–402行还会取消等待中窗口的销毁。检测使用当前main/note-*标签集合，不是物理窗口incarnation快照；同标签销毁/重建的实际事件时序不在本次静态证明内。 |
| 失败取消 | 合法false ACK先清Quit，再用当前id发取消；不将失败当作成功，不调用may_exit。 |
| 销毁取消通知 | Destroyed380行先保存旧Quit id；清Quit后404–408行向所有窗口发带该id的取消，避免已ACK但仍冻结的窗口只等超时。非终态child销毁仍保留entry且取消Quit；原报告的晚到真实终态清理路径保留。 |
| 超时与旧轮隔离 | 457–460行只有当前Quit仍等于该超时闭包id才取消，旧计时器不能清新轮。 |
| 取消载荷 | 304–308行统一`{id}`载荷，合法失败、参与集合变化、Destroyed和超时均经过该helper。是否只有匹配id的renderer才恢复编辑，未在此轮读取或执行。 |
| 最终退出 | `may_exit`270–280行本身仍同时要求waiting空与所有录音entry空；终态但live child仍等待Destroyed。但重复ExitRequested可以走前述早返回绕过该判定，这是本源已知阻塞。 |
| 文档与录音标签 | 文档Quit集合明确main/note-*；录音仍是canonical小写连字符UUID的recording-*，与52精确36字符UUID校验兼容。既有访问barrier的`document_participants`只过滤精确录音标签，main/note和未知标签仍保留。Quit文档集合与访问barrier用途不同，未将二者混写为同一集合。 |
| 宿主与权限接线 | lib.rs仍用Destroyed和ExitRequested分别调用registry处理；begin/finish访问barrier两处过滤保持不变。4个capability相对8e没有修改；50子窗不获toolbar default，整合52时叠加独立麦克风预检capability即可。 |

原NATIVE50-01的子窗已销毁后晚到owner终态清理仍保持：session/operation、owner_alive及真实caller验证在移除之前，只有saved/discarded置terminal，`terminal && child_destroyed`才移除。失败、未知与冒认不清除；正常child-live终态不提前解除退出guard。

本次只审原生源码，不证明合同的“首次异步等待前封住新正文变更”“取消后仅恢复仍有合法权限的编辑入口”“活动组字不丢失”等renderer行为。已有原生ACK逆序的防御性限制仍按第二轮记录，总独审此前反馈正常renderer先结算/flush再success ACK，未据此新增阻塞。本轮未重复验证其前端结论。

## 最终一行修复：仅复核重复退出路径

最终源码固定`12e5cd2bfcb9dca75983a3c54f67d6f4a94c6cf0`。相对1b47只读取`recording_window.rs`的一行差异及422–448行上下文，不扩其他范围。428行早返回已改为`exit_allowed || (entries.is_empty() && quit.is_none())`。

本次漏检更正、已知首次失败和最终静态结论一并封存：1b47中“entry空但Quit仍等待正文ACK”的第二次退出绕过由总独审实际发现，本审查随后确认源码并撤回初步无阻塞结论；原固定源的失败结论保存在本文件上方及`result-quit-recheck.json`，没有被最终结果覆盖。

最终控制流：当`quit.is_some()`且`exit_allowed=false`时，无论entries是否为空，428行都不能早返回，必到431行`prevent_exit()`，再在432–433行保留现有Quit并返回；不会创建第二轮或把未齐正文ACK算作成功。`quit.is_none()`且entries空时，既有无录音退出快路仍可返回；`exit_allowed=true`只沿既有已获准路径返回。锁失败仍prevent_exit。

因此**NATIVE50-02重复退出绕过在这一最终窄静态范围内已修复**，没有在这一行差异中发现新增阻塞。没有构建、测试或GUI运行；实际重复ExitRequested、正文冻结与恢复、完整退出结果由verify_app另行验证。本结论不提升为产品source-ready或实机验收通过。固定最终blob身份见`result-quit-final-reentry.json`。
