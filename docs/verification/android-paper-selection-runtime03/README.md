# Android paper selection build03：保数据升级与实际纸张有限验收

结论：**PASS，范围限准确APK保数据升级、plain/grid-large圆角、当前样式重复选择的可见选区/真实撤销、系统返回，以及继续输入保存重开和原文/纸张恢复。** 设备已释放，最终 `42-final-cancel-note.png` 停留原指定QA笔记查看态，键盘隐藏。

操作对象仅 `emulator-5580/com.local.notesclone`，sdk_gphone_arm64/emulator_arm64、Android11/qemu1。使用既有 `QA-PAPER-INDEPENDENT-20261103C`，正文 `Alpha Beta Gamma`、Beta粗体，开始grid-large。未打开无关笔记，列表截图仅附带原有合成QA条目，未导出数据库/音频。

独立产物/source/assets/certificate全门槛先在 `../unified-candidate06/android-paper-selection-independent03/` 完成：source093986d、freeze39190998…、882检查、新实际apksigner验证、包内CSS/JS完整解压匹配、HTML结构匹配。之后才操作ADB和安装。APK177,445,114bytes，SHA256 `d6350a35374a8fa05c836e26f361dfb3d4834882fd4a360ad7a7ebbedf2d123c`。

升级前设备APK实算旧recovery02 `843e0c01aad154872851664ced574e1fa07544d8fcf874022698c37a3ee160f8`。01身份、02完整原文/原日期2026年11月3日23:45、03原grid-large已保存。05仅执行 `install -r`准确新APK，Success/exit0；06设备base.apk实算d6350…相同。userId10169、firstInstallTime2026-11-03 22:09:17保留；lastUpdateTime由17:02:35变18:41:56。PID由18341变19635。07打开升级App，直接进全部备忘录列表，点击完整标题匹配的原QA行，未使用私人搜索/数据库枚举。

## 实际链与观察

| 原始截图 | 实际操作与观察 |
| --- | --- |
| 10 / 11 | 新包原QA正文/粗体/原日期和grid-large保持。11金色选框四角可见圆弧；升级前03同设备旧grid框是方角。 |
| 12 | 首次真实点击当前grid-large关闭纸张页，完整标题/日期/正文ROI与10逐像素相同。 |
| 13–18 | 正文末尾真实输入临时X；长按选择Beta，15可见蓝选区；更多→纸张→点击当前grid-large，18仍是同一Beta蓝选区和GammaX。 |
| 19–22 | 重新进入编辑，真实点击Undo使GammaX→Gamma，Redo使Gamma→GammaX，再Undo恢复Gamma。20和22原始PNG SHA相同。这证明当前样式重复选择后这一条可观察历史仍可用。 |
| 23–26 | 完成编辑，grid-large→plain；重开25确认plain实际保存且四角圆弧。26真实Android `keyevent4`关闭纸张页，回同一QA。 |
| 27–31 | plain下末尾真实输入临时Y，长按Beta；纸张→首次重复点击当前plain，30仍保留Beta蓝选区和GammaY；真实Undo移除Y，31恢复原Gamma。 |
| 32–35 | 重复选当前plain后继续真实输入临时Z；完成→返回列表→点同QA重开，34明确见GammaZ和粗体Beta。35纸张页仍plain选中，证明这条普通保存/笔记重开路径。 |
| 36–42 | 系统Back回正文、末尾真实Delete移除Z；完成保存、改回最初grid-large、离开再重开。40原文，41grid-large金边选中，42取消回原文查看态，键盘隐藏。 |

临时X/Y/Z均已移除。最终完整标题、正文与粗体Beta和开始一致，grid-large经笔记离开/重开后确认。授权真实输入正常更新了QA修改时间，最终2026年11月4日18:54；**不声称原23:45修改时间保持，也未通过数据库回写旧时间**。6篇列表计数保留只是一项可见观察，不代表检查了所有记录。

## 原图与有限图像复核

38份截图全部是原始 `exec-out screencap -p` 1080×2280 PNG，没有缩放/裁剪/补画替换原图。43份编号JSON保存每次实际参数/时间/退出/stderr、截图大小/hash、PID及适用身份。全部截图大小/hash重新核对。`analysis.json`只分析保存的原图；未修改参考录屏或历史证据。

- 升级前02与升级后10的ROI `[0,240,1080,800)`：零差异，含完整标题、原日期、正文。
- 10与首次当前grid选择返回12同ROI：零差异。
- 开始02与最终42标题ROI `[60,335,1020,510)`、正文/粗体ROI `[60,520,540,580)`：分别零差异；最终日期因输入正常更新，明确不包含在这两项恢复比较中。
- 同一严格金色阈值、固定ROI，旧grid框bbox `[598,1774,965,2073)`、新grid `[598,1773,966,2074)`；旧plain `[116,529,483,828)`、新plain `[115,528,483,829)`。新plain/grid的顶/底最外行和左/右最外列四端均明显内收，旧框没有，支持方角→圆角修复。边界有1像素变化，不能据此宣称每个尺寸/半径/颜色与原版相同。

## 限制与保留记录

可见蓝选区和真实Undo/Redo是有限原生运行证据；没有读取内部ProseMirror key、selection/history JSON、数据库revision或IPC计数，不能将本次说成证明zero-write。当前样式选择返回后键盘隐藏、文档处于查看态，后续真实点击可继续编辑；不将其描述为键盘始终显示。输入是ADB真实系统输入文字，不是中文IME组字测试。保存重开是同一App进程内正常离开/重开笔记，没有做编辑后进程重启/force-stop持久化测试。未扩充七种纸张保存、OCR、音频或其他设备矩阵，未授予全页Apple像素一致。

00记录首次受限调用ADB无法绑定本地监听端口，未成功连接设备；保留FAIL_STOP，随后用户已授权范围的系统调用01成功，未覆盖失败。不是自动审批拒绝。17采集进程曾先返回运行中，实际完成10:47:01.153；下一18操作开始10:47:10.262，事件时间证明两次设备动作未并发。

没有uninstall、clear-data、降级、force-stop、权限/系统设置/输入法变更、WebView注入、数据库/音频导出、Mac GUI、build、target/cache操作、产品/历史证据/共享index修改、stage或commit。每次截图前主机和设备可用空间均检查>=2GiB。设备操作已结束，manifest封口后本目录不再写入。
