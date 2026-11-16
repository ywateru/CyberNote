# evolve112 host 独立审查

日期：2026-11-17。审查者未参与实现。本报告只审查宿主模块及作者验证记录，不代替最终装配验收。

## 结论

**MODULE_SOURCE_PASS / integration-open**。未发现 P1/P2 blocking；无需要阻塞本模块交付的安全或契约问题。仅提交本报告，不修改产品源码、作者脚本或111工作树。

- 被审提交：`a10b53fe654428e2eae737bbce025001076fbd3f`。
- 真实上游111：`/Users/water/work/2026/Apple-Notes-Clone-evolve111`，HEAD `868c6dcf960cb3c92f3c9330ec22fbaf7431fe91`。
- 范围：`src-tauri/src/agent_host/**`、`docs/verification/evolve112-host.md`；核对真实111的 agent_access / ToolError / valid_id 契约。
- 未启动用户应用、未访问原库、未操作手机；Unix socket及授权文件仅位于测试创建的临时目录。

## 源码与边界核对

| 边界 | 独立核对结果与代码位置 |
| --- | --- |
| 默认关闭、身份、多库 | `runtime.rs:312`打开时关闭；registry完整workspace/incarnation核对及独立锁；`runtime.rs:525`显式启用。两库共用runtime的端点、凭据、撤销与重启隔离测试实际通过。 |
| 权限 | `runtime.rs:239`与`:262`核对状态、到期、凭据、client、workspace、scope及显式folder；对象实际目录仍由application检查。`types.rs:19`不为operation查询强加read，原工具scope/当前目标由handler承接，无权限集合合并。 |
| 私有文件 | `files.rs:72`目录euid/0700和inode验证；`:112`目录fd上的no-follow打开，文件0600/regular/nlink=1；`:169`原子替换与fsync；`:259`socket自身及父目录身份验证，Drop不删替代节点。 |
| 撤销与取消 | `runtime.rs:485`先使共享generation失效，再写tombstone，最后清理凭据；持久化失败禁用并保留dirty状态。`:515`stop、`:587`Drop取消请求并使旧context失效。重复撤销、新grant、重新启用均不复活旧context。 |
| 排队与投递 | `runtime.rs:827`读5秒/写20秒总期限，client跨grant共用读4/写1/等待8；`:854`出队复核，`:883`返回复核，`:702`每段非阻塞写与revoke共用mutex排序。部分响应撤销后关闭，不能撤回此前已写入字节。 |
| 事务/窗口接口 | `runtime.rs:33`与作者记录明确handler负责真实service、probe/prepare/release、提交与交付复核、取消barrier清理。host不持有Store，也没有用探针证明业务提交或窗口保护。该职责划分作为模块契约成立。 |
| 数据最小化 | typed设置/创建结果只有grant与连接引用；registry保存verifier；secret DTO无Debug。审计限200条且仅固定元数据，未记录参数/正文/token。 |

## 实际执行

在宿主工作树运行：

```sh
EVOLVE111_ROOT=/Users/water/work/2026/Apple-Notes-Clone-evolve111 \
CARGO_TARGET_DIR=/tmp/evolve112-host-target \
cargo test --manifest-path src-tauri/src/agent_host/harness/Cargo.toml --offline --locked
```

退出码0：**21 passed，0 failed**；doc-tests 0项。harness直接编译被审host源码及111真实agent_access；ProbeHandler只观察调用边界，不证明SQLite/Session业务结果。

另在`/tmp/evolve112-host-independent-harness`建立一次性harness：原作者测试作为辅助函数，lib通过绝对路径引用被审真实host模块，build脚本仍提取真实111定义；没有复制或改写被审产品源码。

```sh
EVOLVE111_ROOT=/Users/water/work/2026/Apple-Notes-Clone-evolve111 \
CARGO_TARGET_DIR=/tmp/evolve112-host-target \
cargo test --manifest-path /tmp/evolve112-host-independent-harness/Cargo.toml --offline --locked tests::independent_
```

退出码0：**4 passed，0 failed，21 filtered out**。新增独立边界：

1. 同client撤销两次后重新授权，再stop/start，旧token及已分发context持续无效，新grant仍可用，重复撤销不递增版本。
2. 控制字符client、空目录集合、非法目录ID、过期输入均拒绝，不改变registry/凭据集合，已有grant仍可用。
3. handler future panic转为STORAGE_ERROR；随后同client写请求可执行，permit未泄漏。
4. 运行中替换credentials目录，撤销返回错误但tombstone已生效，旧token被拒绝，不删除替代目录中的同名哨兵；再次启用拒绝不安全目录。

探针修正记录：最初把`../escape`当作非法物理ID，出现一次断言失败；真实111的valid_id允许该字符串（它是opaque ID，不用于文件路径）。改为违反真实valid_id的前导空白后四项通过。这是测试假设修正，不是产品修复。首次过滤`independent_`还匹配了一条作者多库测试，最终使用`tests::independent_`精确运行新增四项。

`git diff --check`：退出码0，无输出。没有重复运行作者记录中的Clippy/rustfmt，本报告不将其列为独立执行结果。

## 尚未执行的装配门槛（nonblocking，必须继续承接）

- 真实Tauri命令、唯一Session/NotesApplicationService、stdio adapter、真实窗口协调/取消清理/metadata通知及SQLite回执未装配，不能称端到端通过。
- workspace切换/维护恢复导致incarnation变化时，集成必须先await stop，再清理本库旧授权或切换私有runtime并重新授权；当前拒绝不匹配registry符合模块安全边界，不作为缺陷。
- foreign-UID文件/peer分支只读源码与编译覆盖，未提权构造；磁盘故障测试证明当前进程fail-closed，不承诺未fsync状态跨进程持久化。

P1/P2 blocking：0。P1/P2 nonblocking缺陷：0。上述integration-open是后续强制验证责任，不是已通过的运行证据。
