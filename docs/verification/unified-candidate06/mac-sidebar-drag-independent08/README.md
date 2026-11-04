# Mac08 产物独立核对

结论：准确 Mac08 本地签名应用通过产物启动门槛和完整来源核对。复用 Mac07 脚本，替换本轮准确身份并增加两项产品差异检查；脚本一次执行退出0，1004项检查通过，未扩展额外测试套件。实际拖动、选区行为及像素验收由root另行操作准确包验证。

作者BUILD STOP与root执行授权之后，才创建本独立目录并一次固定全部作者记录、旧输出、两个app和两个ZIP。最终README、delivery-manifest和delivery-readback均包含在首次固定输入中，不声称它们在作者STOP之前保持不变。完整替换见adaptation.json；原Mac07独核目录只读。

来源HEAD `845f123ada626ef3fe3f8d78db6c2627c72f26ac`；根授权SHA256 `4e7d783fa48cd516f6bc46cc5bc5f74d01fbdcf13571706a5c189156fe7f708c`；freeze SHA256 `77a774c613cb2c2906b1e63f66166e32312c658136498112139529b19c3f8bd1`。302个当前冻结输入、238个准确提交产品blob、恢复工具及4份构建/收集输入快照均独立核对。产品聚合 `950788b2adc200aa17dc1c8f19de3b59deee1b8a413ad5e339fe68ea57162399`，输入聚合 `e813ca54e8a46b981db04d5b54eb344966d522c4761165cdda4fb6a3260355cc`。

相对准确Mac07提交8614d788745a6183542d261d1c6b6fc789084dc7，238产品文件的提交差异精确只有src/App.tsx增加1行、删除0行。整文件等于旧源码在唯一ResizeHandle onPointerDown中、drag.current赋值之前插入`e.preventDefault();`。CSS、原生toolbar等其他237产品文件相同；这证明代码变更范围，不证明真实拖动效果。

构建/收集结果、attempt01、`pnpm mac:build`、nonce `0ddab590dc1f40e48591f09852b1e33a`、15项输入比较、进程组结束状态、生成产物快照和13份原始命令日志相互关联并通过核对。补充缓存未变依据保存的前后记录相等性；本次没有重新读取缓存，不主张完整系统可复现。

构建前保留的旧app与dist，按完整文件/目录树、大小、SHA256、mode及根inode/device实读核对一致。新原始app对应本次生成记录且可执行文件与保留旧包不同。原始和派生app仅可执行文件签名与CodeResources有记录内变化。两个ZIP无重复条目、CRC正常，完整文件内容与mode均对应各自当前app。

| 产物 | 字节 | SHA256 |
|---|---:|---|
| 原始可执行文件 | 16090480 | `dd120de30bbba231faa1635265c8924b453d8055482745e2c447ad1909dc893f` |
| 原始ZIP | 4823673 | `e459bc693a60dc1edd0bb0a2815c3b8dbe1bdd8190ebf762af53b7405d849c91` |
| 本地签名可执行文件 | 16015072 | `9de0996603eaa91d4185a85f462ae73e3adaa6c22b8320de339208622143b65b` |
| 本地签名ZIP | 4753198 | `ae9292fb4b1c9a1749e26005c84513823c2fdd16612608e332678cd7c7e5e21f` |

原始包deep/strict失败exit1及`code has no resources but signature indicates they must be present`完整保留，未改写失败结果；派生包原收集记录验证exit0。本次另对准确mac-sealed.app执行一次只读`codesign --verify --deep --strict --verbose=4`，退出0，返回valid on disk和satisfies its Designated Requirement。未重新签名或启动app。artifact-gate.json已在来源核对结束前向root提供有限启动门槛，完整结论见result.json。

当前dist完整3个资源文件身份对应本次生成记录；CSS保有Mac07标题规则，准确native源保有其基线。未独立解码可执行文件内压缩资源，不把dist身份核对扩大为内嵌资源解码结论。

作者交付38文件逐一实读，按作者`sha256 + 两空格 + path + 换行`公式聚合为`87c13fe9d078526c1c031761df49273d31b379861f277c3ec5adc8bd7d6dc790`。delivery-manifest自身SHA256 `027f460a8a80bbbda123c9020bef66c2016d3c12d74db960ab0af18e8a8b1a26`；最终README SHA256 `8df6c1964b49d4b63c9c8cc3df7fa6e3ea8bf8685dcfdf12eb018d525788ddb9`；readback构建/收集/四项产物身份均一致。

input-close再次确认首次固定输入全部未变。独立manifest按相对路径排序，以`path TAB bytes TAB sha256 NEWLINE`聚合，排除manifest自身，与作者公式不同。

本任务未执行GUI、ADB、build、重新签名、源码修改、stage或commit，未操作缓存或访问用户数据库。未验证实际启动、拖动/选区、保存重开、权限、Developer ID、公证、Android或像素一致性。
