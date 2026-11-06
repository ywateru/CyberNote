# 设备同步设置

2026-11-06。沿用82顶部“设置”“数据”两标签和[同步架构](../architecture/sync.md)，不新增首页入口。设备同步位于数据总览已有备份区域之后、文件详细信息之前，同一scroll容器；分类详情不显示此块。列表和数据统计采样失败也不隐藏同步入口。手机首页83不变。

```text
设置 | 数据
总占用与分类 / 备份导入导出
设备同步                 状态 / 最后成功时间
[设备名称                  ]
[开启此设备同步服务] [加入同步]
服务地址 [ws://IP:端口 或 wss://隧道地址]
[生成配对串] [复制]       [立即同步] [停止]
已配对设备    名称 / 最近成功 / [撤销]
冲突          版本数量 / [查看]
```

默认未开启，状态错误有可重试文案。新建服务和加入为明确用户操作；配置名称/端口/endpoint，在途命令singleflight并禁用冲突操作。加入粘贴完整邀请，输入type=password/textarea不回显到日志；邀请仅显式生成后可见并标到期、复制失败提示，关闭/切标签清可见邀请。状态不含PSK/private keys，不把邀请存localStorage。网络失败不写“同步完成”；显示durable收件待应用与applied的区别。

使用实际sync_command IPC：command采用type discriminant，status不隐式启用Store/生成身份；startHost{deviceName,port}、createInvite{endpoint}、pair{invitation,deviceName}、syncNow、stop、resume、revoke{peerId}、conflicts、resolve{kind,entityId,digest,keepAll}。包装统一{status,invitation?,conflicts?}；status{state:disabled|paused|listening|connecting|syncing|idle|error,deviceName,workspaceId?,deviceId?,listenAddress?,peers:[{id,name,endpoint?,connected,lastSyncAt?}],lastSyncAt?,pendingCount,conflictCount,error?}。invitation为string；conflicts列表{kind,entityId,variants:[{digest,title,updatedAt?,deleted,purged,locked,attachmentCount}]}。wire输出在前端严格校验，出错不可显示伪成功。identity/adoption等最终由86生产适配器完成。

冲突行显示实体与各版本时间、加密/删除/附件数量，明确保留指定版或全部另存，两者均显式确认本地动作后调用resolve，不擅自按时间丢弃。没有真实native bridge的普通浏览器显示需运行安装应用，不提供假同步产品路径；验收fixture只能显式在调试设施里替换IPC。

布局沿用系统字体、圆角行组、secondary/line/accent变量，浅深色与320px/短屏滚动可达；按钮最小44px触达，横向无溢出。页面aria-live只报安全状态不念配对secret，键盘focus/Tab复用Preferences壳。后台状态刷新不抢焦点；关闭或在途返回的迟到响应不得重新展开secret或覆盖另一操作状态。

程序化命令覆盖真实handlers：sync.status、sync.host.start、sync.invite、sync.pair、sync.now、sync.stop、sync.resume、sync.revoke、sync.conflicts、sync.resolve。命令受既有DEV allowlist，读取HTML和控件状态核验；真实Rust网络另由84/85/86证明，UI fixture通过不能代表网络已工作。
