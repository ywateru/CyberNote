# 桌面与 Android 双向同步

状态：设计与实施中；不是现有包功能。2026-11-06。目标：任一设备本地录入和编辑，在可达网络恢复后自动传播到其他已配对设备。所有数据仍保存在本地，不依赖 iCloud。Android 快速首页83维持现有交付，不增加首页导航层级。

## 范围、拓扑与生命周期

桌面可开启监听作为集合点，Android/其他桌面主动连接。相同workspace中的笔记、普通/智能文件夹、删除/恢复、锁定密文和独立附件双向传播；设备本地外观、选择、窗口、Session、密钥授权和在途附件journal不传播。一个集合点可连接多设备；离线时本地照常编辑，联网后重试。监听默认关闭；用户在设置的数据区域开启并分享配对串。已有两端数据合并，不清空或用全量备份覆盖手机。

连接地址支持 ws://局域网IP:端口、WireGuard/EasyTier 虚拟IP及 wss://匿名隧道地址。网络适配只改变地址，不改变一致性/安全协议。虚拟组网由已运行的系统客户端提供，应用不修改VPN路由。匿名隧道通过明确的本机 cloudflared Quick Tunnel 进程/命令把本地WebSocket映射出去；不自动下载执行二进制、不自动公网发布真实用户库。隧道路线完成需有隔离合成库真实连通证据，不能只凭地址输入框宣称完成。

桌面进程运行时同步，Android在前台或重新进入时同步并恢复连接；不承诺系统杀进程后常驻网络，不用WebView timer冒充后台服务。网络、握手、传输不持Store/Session锁。监听/连接停止后释放socket及线程；失败状态、最后成功时间、待处理/冲突数可读，重试有上限和退避，不假报同步成功。

## 原子记录与本地身份

使用独立同步扩展schema（显式版本、精确校验、事务安装），不篡改既有业务表校验。同步首次启用时分配稳定workspace UUID、device UUID与单调计数；客户端配对采用集合点workspace但保留本地device和已有业务记录。仅首次bootstrap扫描当前数据。default/quick/trash三个系统目录固定保留在本机，不进入wire、dirty或冲突解决，避免createdAt不同产生伪冲突。后续使用SQLite触发器在每次业务 INSERT/UPDATE/DELETE 同一事务内记录 dirty(kind,id)，涵盖Store、smart、archive和附件写入；不在CommitReceipt之后补outbox。dirty只存身份，不复制旧正文。附件变化标记owner note；settings不触发。未启用同步的库不做网络活动。

将dirty固化为版本的事务中同时更新计数、版本头、已见版本摘要及清除dirty。网络apply首先固化尚存的本地dirty，随后在同一事务内关闭本地capture、合并远端heads、重投影业务行、更新已见摘要、恢复capture。回滚恢复开关及原数据；远端apply不会生成无限新本地操作。收件ACK（durable）只表示已校验版本inbox及所需blob均持久落盘，不能显示为已应用；应用ACK（applied）必须等Session安全屏障之后版本头与业务投影事务提交。业务行有dirty即保证重启后可补发，不要求每个尚未发送的连续按键保留旧全文历史。

## 版本与删除

每个实体使用device→counter版本向量与内容摘要。版本身份绑定workspace/kind/id/向量/完整payload；使用规范化JSON与SHA256。对同一实体，向量严格支配的旧头可删除payload，但保留vector→digest摘要用于拒绝同版本异内容。不可比较的头全部保留，不以本地revision、updatedAt或时钟判断胜负。重复投递100次不增加实体；接收顺序不改变head集合及确定投影。计数溢出、设备/heads数量超限明确报错。

本地普通编辑继承当前投影的那个head，不悄悄join其他冲突；显式解决才join所有heads。投影优先永久删除墓碑，其次回收站/目录删除，其次按稳定摘要排序挑选，余下版本仍可取回。因果后继的显式恢复可取代已观察删除；旧编辑不能复活删除。purge保留无正文墓碑，未建立设备撤销/重加入与GC证明前不自动清除墓碑。显式purge清除当前已知冲突正文，未见并发版本仍保留为可恢复冲突并不投影复活。

冲突列表显示笔记/目录、版本数量和时间，支持保留指定版本或全部另存后解决；操作在一事务生成join版本与必要副本。媒体版本须保全各自blob引用，locked版本须保留sealed且不要求网络层解密。不使用现有仅支持普通无附件的recoverConflictCopy冒充完整冲突处理。普通多版本预览只在本地授权后读取；锁定版本仅显示本来明文的标题和时间，解密必须显式本机密码路径。

目录可并发移入彼此或删除owner：wire heads保留原值，确定性投影按稳定ID断环，将悬空普通目录移到根；笔记缺失/无效owner投影到default，回收站状态优先。不能因投递顺序不同生成不同的真实业务图，也不能跳过坏图仍ACK。合法但依赖未到允许持久暂存，恶意结构/非法系统目录修改直接拒绝。

## Wire模型

WireVersion V1：workspaceId、kind(note/folder)、entityId、vector(BTreeMap UUID→正整数)、payload(null为purge墓碑，其他为原始实体封装)、digest。note payload包含原始Note去除本地revision，及只被该document真实引用的WireAttachment{id,noteId,kind,mime,displayName,size,recordedAt?,sha256}，deny_unknown_fields，排除relativePath。folder去除本地definitionRevision。对端传来的local revision/path绝不直接使用；投影本地Note revision递增使旧CAS失效，smart definitionRevision同理。

禁止使用workspace()导出：它会把本机已解锁sealed正文解密。raw locked Note仅empty document、空plainText和sealed，既有title明文契约保留，但整条传输须认证加密。Session token、窗口、授权、settings和attachment_operations永不在wire。首次开启、重新锁定与分支压缩不额外保留线性旧明文；仍存的并发明文冲突须明确显示并允许用户处理，不能声称锁定某分支擦除了其他分支。密钥和配对凭据不进入数据库备份settings。lockNote写入同一SQL事务清除当前线性head与已知同因果inbox中的旧明文payload，保留vector/digest继承上下文，不能等后台下一flush才清；已redacted摘要不得出现在可fetch inventory。已知并发明文分支不被悄悄删除。

接收先用生产字段/文档规则验证单体wire，依赖暂缺或并发环进入pending或确定性图修复，最终投影才用完整业务图验证；不可直接把raw batch包装成归档而拒绝合法乱序。验证字段、id、时间、文档节点、附件归属/类型/大小与sealed一致性；拒绝未知协议/字段、伪路径、同ID异内容、损坏hash、超过64层JSON/16MiB实体消息/64设备向量/32并发头/256MiB单blob。所有网络读有截止与帧长上限，坏数据不改变业务库与已确认状态。单个head必须分片，最多16MiB有界重组而非强塞48KiB帧。另限制全局inbox最多1024版本/64MiB、同时staging最多4个/512MiB、同步blob缓存默认4GiB并保留至少256MiB磁盘余量；超过预算不ACK且显示可重试原因，重复hash不重复分配文件。具体常量可保守降低，不能无说明提高。

## 独立附件

业务库只存metadata/引用，不存图片录音二进制。同步blob保存于独立.sync/blobs/<sha256>.blob，网络先在不持Store锁时写独立随机staging，再通过本地File短调用完成发布（不得让Store reader等待socket）；校验长度和SHA256、文件fsync、原子rename并同步目录后才可被版本引用。对端不得指定本机路径。断线只重传/续传未完成blob，不创建可读坏引用；启动清理/恢复staging，不用本地attachment_operations。当前业务附件投影使用每个attachment独有的受管路径，避免purge一张笔记误删其他冲突副本共用文件。已发布冲突blob和待处理版本不得被本地journal回收。暂不自动GC未引用同步blob。

## 配对、身份与传输

使用标准Noise协议实现snow：Noise_XXpsk3_25519_ChaChaPoly_BLAKE2s；每连接完整新握手，再进入有序AEAD传输。WebSocket binary frame承载Noise消息，端点可ws或wss，不能因为隧道TLS在第三方终止而裸传笔记。协议/workspace绑定到prologue，握手后验证固定远端static public key。

首次配对为有时限的一次性256bit PSK邀请（10分钟），串包含V1/workspace/邀请ID/endpoint/host public key/高熵PSK；不是自制6位码。握手证明PSK后从Noise获取client static key，成功时原子消费邀请并授权设备；此后相同凭据只接受已绑定static key。邀请撤销/过期不接受首次连接。凭据与static secret在.sync目录0600文件原子替换持久化，排除日志和归档。跨身份文件/SQLite使用可恢复Prepared→幂等DB workspace adopt→Ready过程；Prepared不可发实体数据，崩溃后同一凭据可继续而不是丢失已adopt库。连接在每个读写请求检查授权，撤销后旧连接也拒绝。邀请与连接错误只显示安全摘要，不记录PSK、密钥或正文。

认证前不返回实体清单、标题、数量或blob，只提供有界握手；网络只接受固定inventory/head/blob/push/status协议，不暴露IPC、debug、任意读写/导入导出路径。已配对设备有写权限，不把加密描述成阻止合法设备恶意删除；冲突保留/备份用于恢复。peer静态key+deviceId绑定，现有已加入不同workspace必须明确错误，不默默混合两个独立网络。

库存分批只列实体/version digest，缺失head按摘要请求、blob按hash分块传输（每明文帧不超过48KiB），缺blob的版本留独立inbox，完整校验后apply。重复/丢ACK通过再次清单比对恢复，不以短连接内存cursor作为唯一可靠性。版本/附件大于预算显示明确错误，不无限重试同坏包。

## 应用桥接及UI

远端消息先进入独立持久inbox，不直接覆盖活跃编辑器。准备apply使用独立quiet两阶段屏障，不能直接复用现notes-access prepare（会全窗cover、stop录音和destroy editor）。先通知窗口等待真实TagComposition与PM事务settled且不设Session.pending，允许最终IME保存intent；目标editor短暂freeze并flush收齐ACK后，再开commit gate并重新校验dirty generation/heads/依赖targets，变化则abort/reprepare。picker/附件ACK/录音owner仍活跃时延后其依赖变更，不为了远端apply强行pause/close；无关实体继续apply。不能把pending=false当composition完成。接收ACK只对持久inbox和blob为已收，另区分已应用状态。接收不可伪造本地window/epoch/token。保持当前编辑焦点和Undo，不因不相关远端变化重挂。普通内容/置顶/命名仅metadata，不统一bump noteEpoch；锁定/删除/sealed切换才撤销目标授权。可信snapshot若证明session、noteEpoch、owner/editor/document均不变，允许附件与录音目标重绑已变化的全局epoch，不能删其他校验。

继续两个现有顶部标签，在“数据”区域加入“设备同步”子区域：

```text
设置                         数据
总占用 / 分类明细 / 导入导出（保留）
设备同步     [未开启 / 等待连接 / 同步中 / 已同步 / 错误]
本机名称     [名称]
[在此设备开启同步服务]  [通过配对串加入]
服务地址     [ws://IP:port / wss://...]
[生成配对串] [复制] [立即同步] [停止]
已配对设备   手机 · 最近成功时间   [撤销]
冲突         2条  [查看与保留版本]
```

手机首页不新增同步按钮，回前台由Rust服务触发重连；设置状态可人工立即同步。320px/深色、键盘焦点和关闭恢复均沿用82设置壳；调用真实IPC且生产不开放debug。临时邀请只在显式展开时展示，关闭清理可见secret。

## 验收及完成条件

第一模块84是可运行的持久版本/附件核心，85是认证真实网络，两者通过不是完整目标完成。86集成Session/UI/生命周期，87完成两真实App与全新隔离AVD以及网络路线验收和准确出包。

至少覆盖：A创建→B编辑→A收敛、多设备转发；离线不同/同实体并发；含媒体/locked并发；删除对编辑/恢复对旧删除/purge对旧设备；重复100次/同向量异内容；丢ACK/乱序/commit前后SIGKILL；blob半上传、先于/晚于doc；错误密钥/跨workspace/帧篡改/未配对/撤销；大包/深JSON/循环folder/伪路径；pending、IME、附件/录音期间远端更新与owner不漂移。

主证据为两个独立Rust进程、独立临时SQLite、生产Store/SyncService和真实socket；测试控制仅stdin，不把FakeBackend当同步实现。故障代理只扰动网络帧，不能替换合并算法。准确崩溃栅栏、PID、协议版本、自然退出与状态/文件摘要保全。再接真实App DOM，最后全新独立Android设备/AVD，原约13秒录音现场不安装/启停/读取/备份，真实麦克风不用。局域网/隧道/VPN路线逐项记实际可达证据与限制，不外推。全部目标当前证据通过才可标goal complete。
