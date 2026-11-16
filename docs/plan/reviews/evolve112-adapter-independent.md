# evolve-112 adapter 独立审查

日期：2026-11-17。角色：独立 verify；未参与 `crates/notes-mcp` 适配器实现。审查工作树 `/Users/water/work/2026/Apple-Notes-Clone-evolve112-adapter`，分支 `codex/evolve-112-adapter`。

审查实现：`c2ca7213`、`dc666fa9`、`28d9e0db`（被审 HEAD）。本次唯一仓库改动为本报告；未修改实现、作者测试、fixture 或设计契约，未访问 evolve-111 独审工作树，未启动真实应用、安装配置或接触用户资料库。

## Findings 与结论

- P1 blocking：无。
- **P2 blocking：F1，adapter 把 attrs 等辅助 object 算作业务节点，拒绝真实服务合法的 document 输入及 read 输出。**
- P3：无新增需修复问题。
- **结论：blocked（被审 HEAD `28d9e0db`）。** 作者现有测试及初轮14项 adapter 边界测试通过，不足以证明公开节点契约一致；本轮补充真实原生服务边界后发现 F1。已立即通知主 agent 转开发者修复，本报告不修改实现。

### F1 — maxNodes=20000 在 adapter/真实服务计数不同（P2 / blocking）

契约：主树 `docs/architecture/agent-mcp.md`「通用 DTO / 首版工具目录」的 `limits.maxNodes`、文档最多20,000节点，及 document 完整读取约定。不能用作者 README 的“比业务保守”自行收缩该公开限制。

代码：adapter `crates/notes-mcp/src/schema.rs:248` 的 bounded_content 对**每个 object**加1，包含 heading.attrs；`src/lib.rs:159` 用于 create/update 输入，`src/ipc.rs:199` 又用于 notes_read 输出。111源 commit 的 `src-tauri/src/application/document.rs:38` 按带 `type` 的文档节点计数，不计 heading 的 attrs。两侧 capabilities 均宣称 maxNodes=20000。

真实复现文档：

```python
doc = {"type": "doc", "content": [
    {"type": "heading", "attrs": {"level": 1}}
] * 19999}
```

它含20,000个文档节点、39,999个 JSON object、紧凑 JSON 779,987字节，深度和1MiB正文/2MiB frame限制均满足。按 UTF-8、sort_keys=True、紧凑分隔符序列化的 document SHA-256：`cb8343980dda85ab89f1d76c1fb7d8953d78041ee1e6f0c63277d83cc9117475`。

从111 commit `868c6dcf960cb3c92f3c9330ec22fbaf7431fe91` 经 **git archive** 提取 production 源码及编译所需测试资源到独立临时目录，保持生产 harness 的模块引用；仅在临时副本追加一个测试。使用独立 `/tmp/e112-native-boundary-target`，不使用111工作树/target或用户数据。实际调用 setup → NotesApplicationService external_write/probe/prepare/commit → query(notes_read,document)：

- 临时真实 Session/SQLite 创建成功，`committed:true`、`committedRevision:1`。
- 真实服务 read.content 与输入逐值完全相等。
- 将**该真实服务的原始 create arguments**经实际 rmcp stdio adapter 发送：CONTENT_TOO_LARGE，Unix fixture 收到0请求。
- 将**该真实服务的原始 read result**由 Unix fixture 回放给实际 adapter：CONTENT_TOO_LARGE，Unix fixture 收到1请求，合法完整文档未交付。

原生边界测试命令 `cargo test --manifest-path <临时副本>/src-tauri/src/application/harness/Cargo.toml --locked independent_adapter_heading_node_boundary -- --nocapture`：1 passed、198 filtered，exit 0。首次提取漏带既有 include_str 测试资源导致编译失败；补齐同一 Git commit 的 `src-tauri/tests` 和 `docs/fixtures` 后通过，无修改生产逻辑。

原生临时副本中追加的测试主体（复用该 commit 的 tests::setup/commit/query；fixture 只写 `/tmp`）：

```rust
#[test]
fn independent_adapter_heading_node_boundary() {
    let (_root, mut session, context, _) = setup();
    let doc = json!({"type":"doc", "content":
        vec![json!({"type":"heading","attrs":{"level":1}});19999]});
    assert_eq!(serde_json::to_vec(&doc).unwrap().len(), 779987);
    let args = json!({"folderId":"default", "format":"document", "content":doc,
        "idempotencyKey":Uuid::new_v4().to_string()});
    let result = commit(&mut session, &context, "notes_create", args.clone()).unwrap();
    let read_args = json!({"noteId":result.note_id, "format":"document"});
    let read = query(&mut session, &context, "notes_read", read_args.clone()).unwrap();
    assert_eq!(read["content"], doc);
    std::fs::write(std::env::var_os("E112_NATIVE_BOUNDARY_FIXTURE").unwrap(),
        serde_json::to_vec_pretty(&json!({"createArguments":args, "createResult":result,
            "readArguments":read_args,"readResult":read})).unwrap()).unwrap();
}
```

设置 `E112_NATIVE_BOUNDARY_FIXTURE=/tmp/evolve112-actual-node-boundary.json`，取得真实结果后，用本文附录的 Independent helper 启动 adapter；`f.output_override = fixture["createResult"]` 再 `f.call("notes_create", fixture["createArguments"])` 得输入拒绝，随后 `f.output_override = fixture["readResult"]` 再 `f.call("notes_read", fixture["readArguments"])` 得输出拒绝。两个 call 均实测，非仅静态推断。

修复要求：按共享业务文档节点定义执行公开 maxNodes，输入和 read 输出同时对齐；保留1MiB字节、深度、frame及宿主 schema 验证，不通过降低 capabilities.maxNodes 或放松真实应用校验绕过。增加真实服务可提交的边界文档输入/输出互校，并验证超过20,000业务节点仍拒绝。修复前 adapter 模块不通过交付门槛。

**真实 stdio → agent_host → NotesApplicationService → Session/SQLite → receipt → 已打开窗口 → 重启读取的链路本次未执行，不能据此宣称 evolve-112 整体或产品验收完成。** 上述原生边界是隔离模块运行后将实际 DTO 回放到 adapter，仍不是运行中的真实 host/service 连接。

## 契约和官方来源核对

读取本分支 `docs/architecture/agent-mcp.md`、`agent-ipc.md`、作者 `docs/verification/evolve112-adapter.md`，另只读主树最新两份契约：`agent-mcp.md` 最近提交 `9befca8b`；`agent-ipc.md` 最近提交 `656d0ca9`。使用主树新增的 canonical success DTO 和 macOS socket 完整路径字节限制判定兼容性，不以旧分支契约代替。

2026-11-17 独立获取官方资料：

- [MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)：stdio 逐行 JSON，stdout 只能是 MCP 消息。
- [MCP 2025-11-25 tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)：输入校验错误属于 Tool Execution Errors，`isError: true`；未知工具属于协议错误。structured output 须符合声明 schema，并提供等值 JSON text 兼容文本客户端。
- [MCP 2025-11-25 lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)：initialize、版本和能力协商。
- [官方 rmcp-v3.10.0 发布](https://github.com/modelcontextprotocol/rust-sdk/releases/tag/rmcp-v3.10.0)：GitHub API 确认发布时间 `2026-11-12T22:15:38Z`。依赖精确锁定 `rmcp = "=3.10.0"`，仅启用 server/transport-io。

还逐字节比较官方 tag 的 `crates/rmcp/src/transport/async_rw.rs`、`src/service/server.rs`、`src/model.rs` 与本机参与构建的 registry 源码，三者均一致。没有仅凭作者 README 认定 SDK 行为。

`src/main.rs:24` 真正使用 SDK AsyncRwTransport/serve，`src/lib.rs:66` 声明 tools 能力并固定 2025-11-25；初始化、通知、JSON-RPC 和请求路由交给 SDK。实际 stdio 用例中 malformed JSON/超长行被 SDK 有界丢弃，后续 tools/list 正常；这不等于每一条坏 JSON 都得到 Parse Error 应答，作者已正确披露该 SDK 行为。没有自制 MCP 循环，也没有 stdout 日志污染。

## 九工具 schema 与结果包装

核对 `src/schema.rs:53`、`:145`、`:220` 和 `src/lib.rs:116`：

- 固定九工具；全部 input 根对象 `additionalProperties: false`。缺字段、未知工具参数、非法 enum/范围/UUID 拒绝；create/update 的 format 与 content 类型关联。默认参数未在 adapter 插入，合法 arguments 原样转发。
- 每个 output 根对象通过 `oneOf` 覆盖成功 DTO 和严格 ToolError。NoteSummary、limits、match、MutationResult 和 ToolError 元数据对象拒绝额外字段；document 正文是约定的开放对象，应用 schema/附件归属仍由宿主验证。
- capabilities 的两个版本是整数常量 1；15 个 canonical limits 必需且为有界非负整数，包括 `maxDocumentBytes` 和 `maxFrameBytes`。folders 的 `ancestorLabels`、search 的 `match:{field:title|content,snippet}`、operation 的原 MutationResult/pending/not_found 分支均对齐主树。
- 正常与错误均使用 SDK structured/structured_error，真实 stdio 验证 JSON text 与 structuredContent 相等。宿主 `isError` 与 DTO 分支不一致或输出带未知字段时，返回通用 HOST_UNAVAILABLE，不把错误当成功。
- 只读/写入 annotations 保守；写入不声明幂等提示。工具发现不冒充授权，实际 scopes 取自宿主响应。

## 111 fixture 来源和兼容性

通过当前 adapter 工作树共享的 **Git 对象只读命令**核对，没有进入或运行 111 工作树：

```text
sourceCommit = 868c6dcf960cb3c92f3c9330ec22fbaf7431fe91
sourcePath   = src-tauri/src/application/fixtures/service-success.json
sourceGitBlob = c9943b3e096d68c0ce102906397b3bdb2b9d81e4
SHA-256       = 62f905dc9de8fc01da3a955f8224ed183b8ecf77d0a149ebf3b33cc1cfef6f32
```

`git show <commit>:<path>` 的 bytes 与 adapter `tests/fixtures/service-success.json` 完全一致；Git blob 和 SHA-256 与 `service-success.source.json` 一致。只读该 commit 的 `application/tests.rs:1062`，确认 fixture 生成测试经 `setup()` 的临时 production Store/Session 和应用 query/commit，包含 create/append/update，九工具共12例，含两种 read 格式及三种 operation 状态；源测试明确窗口回复是 native test inputs。

本轮 Rust schema 测试和实际 stdio/临时 Unix fixture 均原样回放这些12例，并保留九工具的 scope-denied ToolError 分支。**这是来源和 DTO 兼容证据，本轮没有重新生成这份12例 fixture；另外单独运行了 F1 的临时原生服务边界测试，仍没有运行真实窗口或完整宿主链路。**

可复核副本，无需111工作树：

```sh
git show 868c6dcf960cb3c92f3c9330ec22fbaf7431fe91:src-tauri/src/application/fixtures/service-success.json | cmp - crates/notes-mcp/tests/fixtures/service-success.json
git rev-parse 868c6dcf960cb3c92f3c9330ec22fbaf7431fe91:src-tauri/src/application/fixtures/service-success.json
shasum -a 256 crates/notes-mcp/tests/fixtures/service-success.json
```

## IPC、安全和并发核对

- `src/security.rs:72`、`:88`、`:110`、`:133`、`:209`：openat/O_NOFOLLOW 逐层目录遍历；runtime/credentials/socket 子目录检查当前有效 UID、0700；凭据普通文件0600且单硬链接；socket 必须在 runtime 内、0600、当前 UID。绝对路径、symlink、越界/parent traversal、socket inode 替换有拒绝用例。完整 sockaddr_un 路径按文件系统字节计数并预留 NUL，不截断/找备用宿主。
- `src/ipc.rs:131`：连接后检查 peer UID；发送前和接收后重读凭据、复核 runtime/parent/socket dev+inode 和客户端/credential。独立用例验证请求进行中换 token 或换 socket 后不交付旧正文。**成功路径实际运行了 peer UID 检查；不同 UID peer 的拒绝分支仅做源码核对，未创建跨 UID 宿主。**
- `src/ipc.rs:39`、`:87`：每连接一请求/响应，UTF-8 JSON+newline，2MiB 包含 newline；出站先检查编码帧，再连接/发送，入站 fill_buf 有界读取。缺字段、未知/重复 envelope 字段、版本/UUID/requestId 不符、不完整 EOF、非法 UTF-8/JSON 均拒绝。重复字段验证证据限强类型 envelope，不扩称 document 任意嵌套 Value 的重复键检测。
- `src/ipc.rs:159`、`:218`：响应交付前身份复核，raw credential 在结果字符串和对象 key 的回显被拦截。CLI 不接收 raw token；stderr/结果中未泄露 fixture token。适配器没有 SQLite/Tauri/Store 依赖、第二 Store、自动启动宿主、结果缓存或写重试循环。
- `src/lib.rs:28`、`:167`：读4、写1、等待写8；期限包含本地排队，读5秒/写20秒；超过并发立即 RATE_LIMITED。真实 stdio 检查读超时、写超时、取消均未自动重试。独立取消用例在宿主尚未回包时直接观察 Unix EOF，另验证取消排队写不会发起连接；后续 tools/list 仍可用。
- 断开/超时/取消不能推出零提交；错误不伪造 `committed:false`，保留宿主 operationId/committed/currentVersion/retryAfterMs，恢复提示要求原 key/参数。这些 adapter 行为不证明宿主已经实现提交前取消或持久幂等。

## 实际复跑

全部在 adapter 工作树、既有 `crates/notes-mcp/target` 缓存运行，未使用 Tauri target。以下命令全部 exit 0：

```sh
cargo fmt --manifest-path crates/notes-mcp/Cargo.toml -- --check
cargo clippy --manifest-path crates/notes-mcp/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path crates/notes-mcp/Cargo.toml --locked -- --nocapture
cargo build --manifest-path crates/notes-mcp/Cargo.toml --locked --release
```

cargo test：4 个 query_contract + 8 个 transport 测试通过；transport 中真实 rmcp stdio 服务端子进程/Python wire 客户端/临时 Unix listener 套件13项通过（30.129秒）。不是只运行 handler 单元测试，也未声称使用另一个 SDK 客户端。

release 二进制 SHA-256：`3f623265f1b675cc7f3d3ea8c0dcb549fb923c9e40e0498f38d66b577a1f19a6`，与作者记录一致。

另外独立编写临时 Python 测试（没有改作者文件），复用其进程生命周期 helper，新增断言和 raw Unix response handler；Debug 14项通过（3.052秒），Release 同14项通过（2.632秒）。局部 node/document 边界是 adapter 边界测试，Unix 服务不验证应用 document schema，不代表合法业务文档已提交。

| 独立检查 | 实际结果 |
| --- | --- |
| 九工具全部加 unknown 参数；可省略默认值 | SCHEMA_INVALID 且零 IPC；默认参数未插入 |
| 文档64/65容器层、20,000/20,001对象节点 | adapter 对象边界内转发/超界拒绝；**不是业务节点契约通过，见F1** |
| 中文 input 精确1MiB/多1字节 | 前者成功转发，后者拒绝且不新增 IPC |
| MCP 行未超2MiB，credential 与 JSON escaping 使 IPC 超2MiB | 发送前 CONTENT_TOO_LARGE，Unix 服务收到0请求 |
| 中文 text 页精确32KiB/多1字节；truncated/cursor四种组合 | 精确值通过；超界及两种矛盾组合拒绝 |
| list 紧凑 JSON 精确512KiB/多1字节 | 前者通过，后者 CONTENT_TOO_LARGE |
| document 紧凑 JSON 精确1MiB/多1字节 | 前者完整返回，后者 CONTENT_TOO_LARGE |
| 延迟响应期间更换 credential；下一次请求 | 原响应 UNAUTHORIZED、不含旧正文；下一次加载新 token |
| credential 藏于正文字符串/对象 key | HOST_UNAVAILABLE，不交付 token |
| 已接收请求后替换 socket inode | 原响应 UNAUTHORIZED |
| 真实 Unix 响应帧精确2MiB（含 newline）/多1字节 | 精确值通过，超界 HOST_UNAVAILABLE |
| ToolError 额外字段 | HOST_UNAVAILABLE，不透传非 schema 输出 |
| 取消活动写 | 2秒内实测 Unix EOF，无重试，MCP 会话可继续发现工具 |
| 取消排队写，再取消活动写 | 排队写始终不连接 Unix 服务 |

## 现有 Codex 客户端初始化兼容性（仅 macOS stdio）

按补充要求，未把固定业务 schema/SDK 自洽等同于所有 harness 兼容。读取 [官方 MCP 配置文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[官方 App Server 文档](https://learn.chatgpt.com/docs/app-server)、[官方配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)，使用本机真实 `codex-cli 0.167.0` 的 `codex app-server --stdio`，而不是 Python 假扮 Codex：

1. 新建0700临时 CODEX_HOME 和 config.toml，auth/MCP OAuth store 均选 file 且无认证文件；子进程仅继承基础 PATH/HOME/USER/TMPDIR/LANG 等环境，不继承 API token。cwd 为该临时目录，不加载工作树项目配置，不读写 `~/.codex` 或真实 credential。
2. 仅配置本次 release adapter，经透明逐行 stdio 代理观察初始化。配置使用虚构 workspace/credential-ref，没有私有凭据文件，也没有启动 Unix 宿主。代理若看到 tools/call 直接终止，因此不会执行业务调用。
3. 调用 App Server initialize/initialized，再 `mcpServerStatus/list`（serverName=cybernote_independent、detail=toolsAndAuthOnly）；不调用 turn/start，不运行模型。
4. 实际 wire：Codex `codex-mcp-client` version `0.167.0` 请求 MCP `2025-06-18`；adapter 返回 `2025-11-25` 和 `{tools:{}}`；Codex 随后发送 `notifications/initialized`、`tools/list`，取得全部九工具，toolsError=null。wire 共5条消息，tools/call=0。

因此当前 adapter 虽只列一个 server supported version，SDK 并非只接受同版本 initialize：`rmcp/src/service/server.rs:478` 对不匹配的 initialize 执行受支持版本 fallback，本机这个 Codex 客户端实际接受了协商结果。固定业务 schema 无需据此改为旧 DTO；此证据只覆盖 **Mac OS 26.4 arm64 / Codex CLI 0.167.0 / stdio 初始化与目录发现**，不证明只接受旧版本的其他客户端也能使用，也不证明 DeepSeek、其他 harness 或其他平台兼容。

临时探针 `/tmp/evolve112-codex-probe.py`；私有证据目录由 `/tmp/evolve112-codex-isolated-dir` 指向，包含 wire日志和 status-response.json。没有安装、修改用户配置或调用实际业务工具。真实 Codex 工具读写仍留给116。

## 未执行的集成门槛

尚未运行真实 agent_host、真实授权/撤销持久状态、主应用中的 Session/SQLite、已打开 WebView、重启幂等回放、两真实 agent CAS 竞争、锁定/同步与外部写协调、未保存/中文组字/录音/附件保护及 Android 同步。未修改用户 MCP 配置，未执行 Codex CLI 与实际宿主的业务联调；仅执行上述隔离初始化/目录发现。上述项继续属于主线集成验收；本报告不使用 metadata 或合成回执代替落盘/窗口/设备证据。

## 独立补充用例复现代码

以下为本轮临时脚本的完整内容；保存到 `/tmp/evolve112-independent.py`，在指定工作树执行 `python3 -B /tmp/evolve112-independent.py`。Release 复跑只把 BINARY 中 debug 换为 release。脚本只读作者 helper/fixture，使用新建临时私有 runtime，不写仓库测试。此脚本自身 SHA-256 为 `256718a811f6c4b4564adbd4d167e49507e81849fda0970b621c435c7a16a942`。

```python
import importlib.util, sys, copy, json, os, socket, threading, time, unittest
from pathlib import Path
ROOT=Path('/Users/water/work/2026/Apple-Notes-Clone-evolve112-adapter')
BINARY=str(ROOT/'crates/notes-mcp/target/debug/cybernote-mcp')
old=sys.argv[:];sys.argv=[sys.argv[0],BINARY]
spec=importlib.util.spec_from_file_location('author_fixture',ROOT/'crates/notes-mcp/tests/stdio_fixture.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);sys.argv=old
BODY=1048576; FRAME=2097152
class Independent(m.StdioFixture):
 def assertcode(self,result,code):
  self.assertTrue(result['isError']);self.assertEqual(result['structuredContent']['code'],code)
 def test_ind_all_tool_unknown_inputs_and_defaults(self):
  for tool,args in m.INPUTS.items():
   self.assertcode(self.call(tool,dict(args,unexpected=True)),'SCHEMA_INVALID')
  self.assertEqual(self.requests,[])
  self.call('notes_list',{});self.assertEqual(self.requests[-1]['arguments'],{})
  self.call('notes_read',{'noteId':'note'});self.assertEqual(self.requests[-1]['arguments'],{'noteId':'note'})
 def test_ind_exact_depth_and_object_count(self):
  args=dict(m.INPUTS['notes_create'],format='document')
  content={}
  for i in range(63):content={'child':content}
  self.assertFalse(self.call('notes_create',dict(args,content=content))['isError'])
  self.assertcode(self.call('notes_create',dict(args,content={'child':content})),'CONTENT_TOO_LARGE')
  self.assertFalse(self.call('notes_create',dict(args,content={'content':[{}]*19999}))['isError'])
  self.assertcode(self.call('notes_create',dict(args,content={'content':[{}]*20000})),'CONTENT_TOO_LARGE')
  self.assertEqual(len(self.requests),2)
 def test_ind_exact_input_unicode_bytes(self):
  text='中'*(BODY//3)+'a'*(BODY%3)
  self.assertEqual(len(text.encode()),BODY)
  self.assertFalse(self.call('notes_append',dict(m.INPUTS['notes_append'],text=text))['isError'])
  self.assertcode(self.call('notes_append',dict(m.INPUTS['notes_append'],text=text+'a')),'CONTENT_TOO_LARGE')
  self.assertEqual(len(self.requests),1)
 def test_ind_encoded_ipc_ceiling_without_send(self):
  self.record['credential']='t'*8192; self.write_record()
  # MCP line stays <2MiB; credential overhead makes the outgoing IPC frame exceed it.
  args=dict(m.INPUTS['notes_create'],content='"'*1045000)
  line=json.dumps(dict(jsonrpc='2.0',id=2,method='tools/call',params=dict(name='notes_create',arguments=args))).encode()+b'\n'
  self.assertLess(len(line),FRAME)
  self.assertcode(self.call('notes_create',args),'CONTENT_TOO_LARGE')
  self.assertEqual(self.requests,[])
 def test_ind_exact_text_page_and_cursor_relation(self):
  text='中'*10922+'ab'; self.assertEqual(len(text.encode()),32768)
  self.output_override=dict(m.success('notes_read'),content=text)
  self.assertFalse(self.call('notes_read')['isError'])
  self.output_override['content']+='c';self.assertcode(self.call('notes_read'),'CONTENT_TOO_LARGE')
  for truncated,cursor,valid in [(False,None,True),(True,'opaque',True),(False,'opaque',False),(True,None,False)]:
   self.output_override=dict(m.success('notes_read'),truncated=truncated,nextContentCursor=cursor)
   result=self.call('notes_read')
   self.assertEqual(not result['isError'],valid)
 def test_ind_exact_list_byte_ceiling(self):
  value={'items':[dict(m.SUMMARY,title='')],'nextCursor':None}
  n=len(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode())
  value['items'][0]['title']='a'*(524288-n)
  self.output_override=value;self.assertFalse(self.call('notes_list')['isError'])
  value['items'][0]['title']+='a';self.assertcode(self.call('notes_list'),'CONTENT_TOO_LARGE')
 def test_ind_exact_document_byte_ceiling(self):
  content={'text':''};n=len(json.dumps(content,separators=(',',':')).encode());content['text']='a'*(BODY-n)
  self.output_override=dict(m.success('notes_read'),format='document',content=content)
  args={'noteId':'note','format':'document'}
  self.assertFalse(self.call('notes_read',args)['isError'])
  content['text']+='a';self.assertcode(self.call('notes_read',args),'CONTENT_TOO_LARGE')
 def test_ind_credential_rotation_midflight(self):
  self.delay=.15;self.begin('tools/call',dict(name='notes_read',arguments=m.INPUTS['notes_read']))
  self.assertTrue(self.accepted.wait(2));self.record['credential']='independent-rotated-token';self.write_record()
  r=self.receive()['result'];self.assertcode(r,'UNAUTHORIZED');self.assertNotIn('fixture content',json.dumps(r))
  self.delay=0;self.assertFalse(self.call('notes_list')['isError'])
  self.assertEqual(self.requests[-1]['credential'],'independent-rotated-token')
 def test_ind_reject_secret_nested_value_and_key(self):
  for value in [dict(m.success('notes_read'),content='prefix'+self.record['credential']+'suffix'),dict(m.success('notes_read'),format='document',content={self.record['credential']:'x'})]:
   self.output_override=value
   args={'noteId':'note','format':value['format']};r=self.call('notes_read',args)
   self.assertcode(r,'HOST_UNAVAILABLE');self.assertNotIn(self.record['credential'],json.dumps(r))
 def test_ind_socket_and_runtime_replace_during_response(self):
  self.delay=.15;self.begin('tools/call',dict(name='notes_read',arguments=m.INPUTS['notes_read']))
  self.assertTrue(self.accepted.wait(2));os.unlink(self.record['socketPath'])
  replacement=socket.socket(socket.AF_UNIX)
  try:
   replacement.bind(self.record['socketPath']);os.chmod(self.record['socketPath'],0o600)
   self.assertcode(self.receive()['result'],'UNAUTHORIZED')
  finally:replacement.close()
class Raw(Independent):
 def setUp(self):
  self.raw_mode='exact';self.connection_closed=threading.Event();self.request_seen=threading.Event();self.allow_finish=threading.Event()
  super().setUp()
 def handle(self,connection):
  try:
   with connection:
    connection.settimeout(3); data=connection.makefile('rb').readline(FRAME+1);request=json.loads(data);self.requests.append(request);self.request_seen.set()
    if self.raw_mode=='wait-close':
     if connection.recv(1)==b'':self.connection_closed.set()
     return
    result=m.success(request['tool'])
    response={'version':1,'requestId':request['requestId'],'result':result,'isError':False}
    frame=json.dumps(response,ensure_ascii=False,separators=(',',':')).encode()
    if self.raw_mode=='exact':frame+=b' '*(FRAME-len(frame)-1)+b'\n'
    if self.raw_mode=='over':frame+=b' '*(FRAME-len(frame))+b'\n'
    if self.raw_mode=='invalid-error':response.update(result=dict(m.ERROR,extra='x'),isError=True);frame=json.dumps(response).encode()+b'\n'
    connection.sendall(frame)
  except (BrokenPipeError,ConnectionResetError):pass
  except Exception as e:self.failures.append(repr(e))
 def test_ind_real_exact_and_oversized_host_frames(self):
  self.assertFalse(self.call('notes_list')['isError']);self.raw_mode='over'
  self.assertcode(self.call('notes_list'),'HOST_UNAVAILABLE');self.assertEqual(len(self.requests),2)
 def test_ind_error_schema_extra_field_rejected(self):
  self.raw_mode='invalid-error';self.assertcode(self.call('notes_list'),'HOST_UNAVAILABLE')
 def test_ind_cancel_active_closes_connection(self):
  self.raw_mode='wait-close';rid=self.begin('tools/call',dict(name='notes_create',arguments=m.INPUTS['notes_create']))
  self.assertTrue(self.request_seen.wait(2));self.send(dict(jsonrpc='2.0',method='notifications/cancelled',params=dict(requestId=rid)))
  self.assertTrue(self.connection_closed.wait(2),'cancel must close IPC socket before any host response')
  self.assertEqual(len(self.requests),1)
  # Discovery proves the SDK session remains usable after cancellation.
  nextid=self.begin('tools/list',{});r=self.receive()
  if r.get('id')==rid:r=self.receive()
  self.assertEqual(r['id'],nextid)
 def test_ind_cancel_queued_write_never_connects(self):
  self.raw_mode='wait-close';first=self.begin('tools/call',dict(name='notes_create',arguments=m.INPUTS['notes_create']))
  self.assertTrue(self.request_seen.wait(2));second=self.begin('tools/call',dict(name='notes_append',arguments=m.INPUTS['notes_append']))
  self.send(dict(jsonrpc='2.0',method='notifications/cancelled',params=dict(requestId=second)))
  # Barrier request ensures cancellation notification was consumed.
  third=self.begin('tools/list',{});r=self.receive()
  if r.get('id')==second:r=self.receive()
  self.assertEqual(r['id'],third)
  self.send(dict(jsonrpc='2.0',method='notifications/cancelled',params=dict(requestId=first)))
  self.assertTrue(self.connection_closed.wait(2));time.sleep(.15)
  self.assertEqual(len(self.requests),1)
if __name__=='__main__':
 suite=unittest.TestSuite()
 for cls in [Independent,Raw]:
  for name in cls.__dict__:
   if name.startswith('test_ind_'):suite.addTest(cls(name))
 result=unittest.TextTestRunner(verbosity=2).run(suite)
 sys.exit(not result.wasSuccessful())
```

## 修复独立复核：ec2a051e（2026-11-17，最新结论）

被审修复 commit：`ec2a051e0b1e9c115b61c1494ecf10ae5225ee89`。本段是在原始 blocked 报告之后追加；上文 F1 失败记录、原始脚本和证据均保留，不用修复后的输出覆盖历史失败。

**最新结论：pass（adapter 模块）；F1 已关闭，无剩余 P1/P2 blocking。可合入主线准备装配。** 该结论不包含运行中真实 host/service/窗口的端到端验收；真实 Codex 工具读写仍留116。

### 增量审查

产品代码增量限 `crates/notes-mcp/src/schema.rs:248` 的共享 bounded_content：只有含 `type` key 的对象计入节点数，attrs/strokes 等未含 type 的对象不增加业务节点数；JSON 根深度0，所有 JSON value（包括 null、scalar、空 object/array）均检查 `depth > 64`。create/update 经 `src/lib.rs` 使用同一检查，document read 经 `src/ipc.rs` 使用同一检查。

这一算法与原生 application::document::input_document 的节点/深度资源遍历相符；1MiB UTF-8/紧凑 JSON、2MiB IPC frame、text/list 页上限、宿主业务 schema 校验职责均保留。未降低 capabilities.maxNodes，未修改旧12例 service fixture、原始独立 F1 fixture或新增第二 Store/宿主替身业务实现。

作者新增 `document-boundary.json` 的 SHA-256、generatorSha256，以及其 `sourceCommit=eb9cee7d3ad1bf90a317ce9c286c653094512f90` 对应 document.rs Git blob，均在当前工作树共享 Git 对象上只读复核一致。未运行作者会覆盖其 fixture 的生成脚本。本轮真实原生再验证使用下述独立临时副本和独立输出文件。

### 原始 F1 探针复跑及失败证据保全

原封不动运行原有 `/tmp/evolve112-f1-probe.py`，分别指定修复后的 Debug 和 Release binary 并使用 `--expect pass`，两次 exit 0：

```sh
python3 -B /tmp/evolve112-f1-probe.py --binary crates/notes-mcp/target/debug/cybernote-mcp --expect pass
python3 -B /tmp/evolve112-f1-probe.py --binary crates/notes-mcp/target/release/cybernote-mcp --expect pass
```

原始779,987 bytes/20,000 node实际 service fixture的 create/read 均不再 isError，structuredContent 与原生 createResult/readResult 完全相等，IPC请求数由原先 create 0/read后累计1变为 create 1/read后累计2。成功结果分别另存 `/tmp/evolve112-f1-fixed-debug-results.json` 和 `/tmp/evolve112-f1-fixed-release-results.json`。

保留且重新核对原始证据指纹：

| 原始证据 | SHA-256 |
| --- | --- |
| `/tmp/evolve112-actual-node-boundary.json` | `5966d0b580c459ba02e814f93853ba870a371674c9100372130bb7f12b1e1396` |
| `/tmp/evolve112-f1-original-cybernote-mcp` | `3f623265f1b675cc7f3d3ea8c0dcb549fb923c9e40e0498f38d66b577a1f19a6` |
| `/tmp/evolve112-f1-original-results.json` | `d3fd3621ef273a0d53010d163762696b1b378e872930789a95cbc08f0ba3963d` |

修复后的 release SHA-256：`0d662506f19c51f08ce88637b12a5833812fb2a573cc16324db9edf3fe968f17`；Debug：`3157e659e083264d4983a02510b18b90e870936fcd8c3d9b5a356fcbf8c43c16`。

### 独立真实原生边界及双向回归

在原先从111 commit `868c6dcf960cb3c92f3c9330ec22fbaf7431fe91` 提取的临时 production harness副本追加 `independent_f1_recheck_document_boundaries`，继续使用独立 `/tmp/e112-native-boundary-target`。既有原始测试/fixture不覆盖；未进入111工作树，未使用其 target，没有运行主应用或用户库。

原生测试 exit 0：1 passed，199 filtered（5.68秒）。两个完整合法文档分别经真实 service create → update → read：

| 文档 | 紧凑 JSON bytes | 带 type 的节点 | 所有 JSON value 最大深度 | 实际原生结果 |
| --- | --- | --- | --- | --- |
| 原F1 heading文档 | 779,987 | 20,000 | 4 | create提交、update到revision 2，read完整相等 |
| doc → 30层blockquote → drawing.attrs.strokes空数组 | 1,088 | 32 | 64 | create提交、update到revision 2，read完整相等 |

原生同时验证20,001节点及depth 65文档的 create/update 均为 SCHEMA_INVALID；随后读取已有笔记，完整 DTO 与拒绝前完全一致。新生成的6个成功 DTO和两个非法边界文档另存 `/tmp/evolve112-f1-recheck-native-boundaries.json`，SHA-256 `2d21dfc0ef35fe37e20ae33e518234c54dc6b0ce51c9402f5dc257142ba64763`。

独立脚本 `/tmp/evolve112-f1-independent-recheck.py` 通过实际 rmcp stdio和临时Unix fixture回放上述真实 DTO。新增4项，加上原独立用例中仍有效的13项，Debug **17/17**（6.074秒）、Release **17/17**（3.243秒）通过：

- 上述6个真实 service create/update/read成功 DTO逐值通过，arguments原样转发。
- 20,001节点和depth 65：create/update在IPC前CONTENT_TOO_LARGE，Unix请求数不增加；宿主read输出超限时同样CONTENT_TOO_LARGE，不交付非法内容。
- 分别以 null、空object、空array、boolean、number、string作叶节点，JSON value深度64通过、65拒绝；在create/update/read三个方向均核对。
- 超过20,000个不带type的辅助object不再被误计；marks等带type对象仍计数，type:null的key也按原生遍历规则计数并受上限约束。此项及任意child链只验证资源过滤，**不把这些可能不合法的业务document形状当成真实宿主schema成功**。
- 原独立字节/frame/页大小、额外参数/错误字段、credential轮换/回显、socket替换、取消活动/排队写等13项全部通过。**原脚本旧 all-objects/depth 联合断言整项排除，不作为契约成功标准，也未改写原始脚本。**

复跑命令：

```sh
python3 -B /tmp/evolve112-f1-independent-recheck.py --binary crates/notes-mcp/target/debug/cybernote-mcp
python3 -B /tmp/evolve112-f1-independent-recheck.py --binary crates/notes-mcp/target/release/cybernote-mcp
```

新增独立探针SHA-256：`af962ce34a6fc82b3b6850669aae4c260c4c6769ca8fd20d19ffe9acc66fa9c6`。日志保留 `/tmp/evolve112-f1-independent-recheck-debug.log`、`/tmp/evolve112-f1-independent-recheck-release.log`。临时原生副本路径仍由 `/tmp/evolve112-native-boundary-dir` 指向；这次仅追加新测试并写新fixture。

### 本次构建与完整模块回归

以下全部 exit 0：

```sh
cargo fmt --manifest-path crates/notes-mcp/Cargo.toml -- --check
cargo clippy --manifest-path crates/notes-mcp/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path crates/notes-mcp/Cargo.toml --locked -- --nocapture
cargo build --manifest-path crates/notes-mcp/Cargo.toml --locked --release
```

cargo test：新增3个document_contract + 原4个query_contract + 8个transport测试通过；其中真实SDK stdio子进程套件从13项增为16项，16/16通过（33.315秒）。本次原生临时harness编译仅有其既有unused imports告警，测试通过，未修改生产源码处理告警。

### 保留的集成边界

本轮没有重新配置或重跑Codex初始化探针，也没有覆盖先前其wire日志；修复仅改变资源遍历，之前 **macOS / Codex CLI 0.167.0 / stdio初始化与九工具发现** 的真实模块兼容证据继续单独保留。它不代表所有harness或其他平台兼容。没有新的模型/真实credential/业务工具调用。

真实运行中的 agent_host → 当前主应用 Session/SQLite → 窗口刷新 → 重启/撤销/幂等/同步，以及116的真实Codex工具读写仍未执行。本轮是真实原生服务隔离边界测试加实际adapter传输回放，**没有声称host/service已接通**。
