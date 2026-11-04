# APP-002-AUDIO-CARD-01 主线整合验证 01

主线精确 `4dbdbd25238c430f7800cb286b642577a09ccf50`，源候选 `9303b48492a83ac21fe596591295d4973eb6f517`，独审提交 `b477f79de23e6c37f1f51a73a53361ca1b8fbab5`。本轮是已通过独审的录音日期/手机紧凑卡合入后的整合回归；**列明的主线构建、源码与受控实际链通过**。不是重复源码独审，不授予全功能、新设备包、有效音轨或原版像素通过。

## 身份与复用边界

`identity-before.json`/`identity-after.json` 逐项核对238项产品输入：大小、SHA-256与9303b48对象逐字相同，聚合 `5d1690457ff9dfca2905309e495a28583173e47744984087ba181a85177af295`。本任务新增/修改的11项检查脚本也全部与作者冻结及其probe manifest相同；前后产品、原脚本及锁文件没有变化。计划文档合并冲突的处理未改变产品输入。

音频链复用此前独立准确编译的新CLI：`src-tauri/target/debug/notes-audio-card-store`，6,012,488 bytes，SHA-256 `a2df38d0b246c8128985ceb911f7dc5cb25fe8745e05c4f131fdaf67d1fc14fe`。编译provenance在 `../app-002-audio-card-independent-01/rust-run01/metadata.json`；本轮重新核对其所有Rust输入、实际复制的Store/Session及JSON schema/corpus均与主线完全一致，再核当前可执行hash。没有重新编译，也没有把该CLI称为Tauri/原生应用。准确源码独审中的Store/Session47项、额外5项及实际Session权限8组结果可以按相同输入引用，本轮没有冒称重新执行这些Rust测试。

标签保存/组合脚本保留原始协议和硬编码身份，使用历史tag-only Store CLI `src-tauri/target/debug/notes-qa-fix-store`，SHA-256 `f43d9695ad1d5cb9a0e0e42bb6af415f6a2e3bf78d65979b57e7ac607b0620cf`。它与新音频Session CLI是两个不同工具。标签相关模块、投影、schema清单/语料及三个浏览器脚本与冻结标签04逐字相同；本轮实际挂载当前App/Editor/保存队列，接既有标签Store运输边界，确认共享App/Editor接入没有回退。此结果不代表标签测试使用了当前新Session或native transport；当前Rust源码完整测试及准确新Session音频链另有独立证据。

## 本轮执行

| 检查 | 结果 | 证据与范围 |
| --- | --- | --- |
| `pnpm build` | exit0 | `raw/build-run01.txt`；TypeScript与Vite生产构建，只有既有大chunk提示；没有Mac/Android平台构建。 |
| schema | 96项，exit0 | `schema-result.json`、raw；真实共享Editor factory与内嵌清单比较，未运行write-manifest。 |
| access | 16项，exit0 | `access-boundary/results.json`、raw；生产响应门与保存revision边界。 |
| native toolbar | 13项，exit0 | raw；实际生产源码边界检查，不是原生GUI运行。 |
| OCR host | 37项，exit0 | raw；真实App AST闭包、OcrHost/bridge/SaveQueue/PM，原生OCR结果和host受控。 |
| 音频Panel→App→新Rust | 5场景，exit0 | `audio-integration-run01/result.json`、五份transport；真实Panel/Session、实际App闭包、production Submission/bridge/SaveQueue、准确Rust Session/Store/SQLite。 |
| 音频卡片NodeView | 8场景，exit0 | `audio-ui-run01/result.json`、transport及PNG；实际Editor/NodeView/MediaView/AudioPlayer，准确Rust受权read，HTML媒体ready/progress受控。 |
| 标签浏览 | 27项，exit0 | `tags-browser-run01/result.json`；实际App/Editor，受控浏览器输入。 |
| 标签保存边界 | 11场景、53条真实Store action，exit0 | `tags-save-run01/result.json`；当前挂载App/Editor/队列与原标签Store运输边界。 |
| 标签组合输入停车 | 12场景、170条真实Store action，exit0 | `tags-composition-run01/result.json`；浏览器引擎及受控DOM事件，不冒称系统IME。 |

全部首次执行通过，没有失败尝试被后续结果覆盖。五套浏览器pageerrors均为空；音频两套记录的外部请求数组为空。保存边界Store action为createNote4/saveNote10/workspace36/settings3；组合边界为createNote14/saveNote47/workspace109。`summary.json`、`commands-basic.json`、`commands-browser.json`保存准确命令、环境工具路径、退出码、耗时、动作数与限制，`raw/`保留完整stdout/stderr。

音频五场景仍实际覆盖：面板打开后权限等待9秒、第一次实际start取时、跨三天暂停/继续/完成，正常保存、首store已落盘响应丢失、正文ACK两次失败后的同Result/File重试、ACK后refresh失败仅重试刷新、旧目标晚store零插入。日期/operation/附件ID/全字节保持，错误日期重复请求冲突；四个已提交场景在新Rust进程和新token冷开后读回相同日期/字节。该冷开指隔离Rust进程，不是设备或原生应用冷启动。

卡片八场景检查已知日期三行、未知日期两行、2.60秒总时长显示2秒但1.75秒进度仍为0:01、320/390长标题及白播放胶囊可达、换ID未回读时清旧值、晚read/失败/卸载/在途访问失效隔离，以及1280桌面隐藏手机日期/总时长而保留原录音mm:ss行。PNG为克隆候选自身结果，不与低清原片计算像素通过。

access脚本仅在本轮副本中将两个固定输出目录字符串改至本证据目录，避免覆盖旧正式结果；生产脚本未改。`scripts/`保全全部执行原脚本及实际改址版本。schema仅刷新常规ignored `artifacts/editor-schema`生成模块，并将本次96项正式结果写到独占路径；旧正式证据未覆盖。Vite ignored cache/dist是常规构建输出，不是原生包。

## 交付边界与资源

每个输出/浏览器阶段先检查至少2GiB，闭合时可用5,569,724,416 bytes。所有脚本进程完成，各自finally关闭本机服务、无界面浏览器和自有Rust子进程；共享host target已明确释放。没有Rust编译、平台构建/安装、下载升级、GUI/ADB、target复制或用户数据库/媒体复制。临时Store及音频占位均由本轮直接生成的合成值创建；不是设备数据的副本。

音频检查使用实际App闭包而非挂载App壳；硬件采集/编码、React setters、Editor command host及IPC运输受控。标签检查则挂载当前App/Editor，但用既有tag-only Store preview运输；两类证据不能互换为native acceptance。真实Tauri序列化、Mac/Android新包、系统权限/输入法、有效编码或可听音轨、设备正常/强停冷启仍待root。原版取时规则、长/小时总时长、深色、展开/拖动/±15/菜单手势与所有高清像素一致性继续unknown。

`manifest.json`按相对路径字符串排序，使用UTF-8 `<sha256>  <relativePath>\n`聚合，排除manifest自身。原始日志中的末端空行保持原字节；不为消除whitespace提示改写工具输出。
