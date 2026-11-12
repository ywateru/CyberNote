# SVG文字缩略图104：只读可行性研究

2026-11-10。结论：可沿用锁定resvg/usvg 0.45.1，**只开启text feature，嵌入一份可信、固定版本的OFL中文字体**，不启用system-fonts/memmap，不使用平台字体扫描或任何外部资源。首选完整静态NotoSansCJKsc Regular，代价16,437,364 B；首版不另建裁剪流水线。usvg遇到缺字只警告并继续，必须另做缺字/转换失败检查，不能仅删除当前text拒绝条目。

本轮仅读取任务、现有产品源码、本地crate源码、已知冻结SVG与定向字体路径，并读取官方仓库的文本/元数据。未改产品、下载字体二进制、安装依赖、编译、运行native/ADB或修改冻结样本。本文是方案，不是能力验收。

## 冻结50张SVG实际需求

已知原件目录：`/private/tmp/cybernote-delivery/artifacts/media99-fixture/originals`。只解析其中50张SVG：

| 项目 | 实际值 |
| --- | --- |
| 文件 | image-0450.svg至image-0499.svg；每张44,142–44,241 B，总2,209,679 B |
| 画布 | 全部width=2000、height=1500、viewBox="0 0 2000 1500" |
| 元素 | 每张701 rect及1 text；总35,050 rect、50 text |
| 文字 | `Media99 SVG 0450`至`Media99 SVG 0499`，每张16字符 |
| 字体/布局 | 无font-family；font-size=42，x=40，y=80；没有tspan、纵排或复杂布局 |
| 字形并集 | **19**字符：空格、0–9、G/M/S/V/a/d/e/i。此前即时消息的17是手计错误，以本次程序计数19为准 |

这些冻结原件没有中文。50张全部成功只能证明Latin标签，不能据此声称中文/tspan通过；需要独立新增小型中文、繁体、标点与tspan布局用例，不能修改冻结原件来增加覆盖。背景有大量rect，整张PNG非空也不能证明文字画出，必须检查文字区域或与受控无文字版本的像素差异。

## 当前接口与最小依赖

`src-tauri/Cargo.toml`当前 `resvg = { version = "0.45", default-features = false }`；Cargo.lock锁定0.45.1。`thumbnail.rs::render_svg`在10K节点/禁DTD预检中显式拒text，并保持2MiB输入、12,000画布轴长、输出不超过1024px及现有PNG缓存、授权与发布边界。

本地crate源码已确认：

- resvg的`text`仅转发`usvg/text`；`system-fonts`、`memmap-fonts`、`raster-images`是独立feature，无需开启。
- usvg/text激活fontdb 0.23.0、rustybuzz 0.20.1、unicode-bidi、unicode-script、unicode-vo。它们当前不在产品锁定依赖集合中，需要实现时更新lock；研究阶段未解析依赖；后续作者实现解析的12项增量见104任务和checks.json，未升级旧锁定版本。
- `Options`公开`fontdb: Arc<Database>`、`font_resolver`、`font_family`及`resources_dir`。可使用`OnceLock`保存只含可信字体的只读数据库；`Source::Binary(Arc<dyn AsRef<[u8]> + Send + Sync>)`可持有静态include_bytes切片，避免每次`load_font_data(Vec)`复制16MiB。
- `FontResolver::select_font`与`select_fallback`均为Send+Sync回调。固定选择内置face，所有generic/未知family做明确的确定性fallback；绝不在回调中加载文件、系统字体或网络。
- usvg `text/layout.rs::shape_text`对缺字尝试fallback，最后只`log::warn!`并返回glyph。它不是可靠的“缺字错误”契约，且某些shaping失败可变为空glyph列表。

建议只增加resvg的`features=["text"]`。需要名义glyph覆盖预检时，直接声明与fontdb/rustybuzz解析结果共用的ttf-parser版本，不引入另一套字体引擎。不能依赖未公开的usvg DatabaseExt::has_char。公开`fontdb::Database::with_face_data`可以把内置face数据和index交给ttf-parser的glyph_index；缺字fallback回调另记本次转换失败标志，Tree解析后拒绝发布。遇到空shaping/无可绘制文字路径也需检测，不能把“解析返回Ok”当成功。空白符、换行、合法控制符须单独分类，不要求它们各自生成轮廓。

## 字体选择、许可与成本

2026-11-10官方GitHub API元数据；Noto CJK main当时commit为 `f8d157532fbfaeda587e826d4cd5b21a49186f7c`。下列sha为Git blob ID，**不是下载后二进制SHA256**；实施时必须按固定commit下载、核二进制SHA256及字体表后提交NOTICE/许可，不在构建时联网取字体。

| 选择 | 准确原始长度 / Git blob | 能力与判断 |
| --- | --- | --- |
| NotoSansCJKsc-Regular.otf，Sans/OTF/SimplifiedChinese | 16,437,364 B（15.68MiB）；dc15562470b4f842321894787a0d066879ccff8b | **首选**。官方“Language-specific OTFs”说明保留full character coverage，SC字形优先；单静态face覆盖中文及Latin，无变量字体运行期开销；不是所有Unicode/emoji都保证有字 |
| NotoSansSC-Regular.otf，Sans/SubsetOTF/SC | 8,331,336 B（7.95MiB）；fc0fda9394367c16c1af7555a2ae4d5e2e6a6f02 | 官方SC地区subset，省8,106,028 B。可选但必须先实际审cmap和明确覆盖合同，不能泛称完整中文/所有繁体、扩展汉字。本轮未下载检查cmap，故不把未知覆盖当已通过 |
| Google Fonts NotoSansSC[wght].ttf | 17,772,300 B（16.95MiB）；fb0637bafbcd804fe32152370a1225990745b4bc | 可变量粗细，但体积较大，首版Regular方案不需要；不是更省空间的替代 |
| Mac/Android系统字体 | 版本/可用性不同；不能作为共同内置资源 | Mac定向检查Arial.ttf存在773,236 B；已知PingFang.ttc直接路径不存在，未扩大扫描。OS预装许可不能据此推断允许把字体复制进APK。Android厂商/API字体来源也不稳定，不做HOME或全系统扫描，不依赖跨端一致路径 |

Noto CJK Sans/LICENSE为SIL OFL1.1，允许随软件bundle/embed/redistribute，要求保留版权与许可，字体不能单独售卖；修改版需遵守Reserved Font Name条件。优先使用未改原版完整face并附原许可/版权，不冒称拥有再授权。若未来裁剪，离线FontTools可以按Unicode集合、layout closure保留GSUB/GPOS与复合glyph，但它是新的工具及可重现资产工序：需要固定工具版本、原字体/脚本/范围/产物hash、许可与名称审查。只裁出当前19个测试字符不满足产品中文需求。本轮未安装FontTools，不给未经实际裁剪的“预计大小”充当准确结果。

跨端成本是每个目标包都增加字体原始16.4MB产品输入；最终签名包压缩增量须实测，不能由原始长度推算。静态切片只映射一份字体数据，数据库/解析表与shaping仍有额外内存；不能把16.4MB称总内存上限。首次文字渲染才初始化，后续共享Arc；非文字SVG可保持原轻量路径。Regular单face是明确fallback：不同font-family与粗体/斜体请求可使用内置Regular作近似替代，保证覆盖字形可见，但不宣称完整保留原字体、粗斜体或品牌字形；非覆盖字形整图typed unsupported，绝不把tofu当成功。需要精确多字重时另加真实face并重新计体积，禁止静默伪造已支持。

## 有界解析与错误合同

建议首版支持横排text/tspan、x/y/dx/dy、text-anchor、常用baseline、fill及继承的font-size，复用usvg排版，不自写中文字宽算法。保留现有所有非文字禁用项；textPath、外部font-face、foreignObject、image/use、filter/mask/pattern等继续明确unsupported。新预算建议总可见文字最多1024 Unicode scalar、128个text/tspan元素、总定位数值不超过4096；font-size/spacing/length等须有限且限制绝对量级。字符与定位预算在usvg shaping之前检查；同时避免重复统计父text和子tspan的itertext。最终数值应由小型实际压力测校准，不能以spawn_blocking超时声称已终止CPU工作。

所有资源继续`resources_dir=None`，image resolve_data/resolve_string恒None。字体仅可信Binary，不启用fontdb/fs/system-fonts/memmap；CSS @import/@font-face、src及非片段url必须明确拒绝，不能仅检查href就声称排除了所有CSS外部引用。为缩小首版面，复杂stylesheet/escape URL可直接unsupported；若支持style属性，使用解析后的允许属性/值合同，不靠易绕过的单一字符串正则。DTD、script、animation与现有非支持效果不放宽。

缺字、超量文字或不支持布局统一返回现有typed unsupported_media，附稳定原因类别，不记录用户文字内容，不落空白成功缓存；字体缺失/损坏初始化失败同样不得回退到系统扫描或不带文字的成功图。Tree转path后的节点/轮廓复杂度应再计数，配合固定可信字体最大glyph轮廓复杂度预检限制放大；后置检查不能替代前置字数限额。

沿用唯一受管File/Session授权与并发队列、源版本复核、原子PNG发布、完整小PNG/IEND/CRC命中验证和撤权清理。只更新现有缓存算法版本并纳入内置字体身份；不得建立第二权限源或前端全原件fallback。

## 实施切分与验收

路径限 `src-tauri/src/attachment_media/thumbnail.rs`及必要小辅助模块、Cargo.toml/lock、内置font资产+许可、现有真实Store harness及文档。无需App/bridge/native插件/Android平台改动；Mac与Android均使用相同Rust字形数据与渲染代码。字体资产必须进入产品指纹输入；若现有productFiles未覆盖新增扩展名/目录，交parent另定最小身份接线，不能漏指纹。

1. 固定字体资产、许可及SHA；只text feature。验证可信face加载、中文/Latin cmap、缺字错误，以及text-only与vector-only路径。
2. 新增小型真实测试：`记录更自然 / 記錄與靈感 / CyberNote 123，。！？`；两行tspan、dx/dy、start/middle/end anchor，字体fallback、常见空白。检查局部文字像素与去字对照，避免背景非空假通过。另以确实未覆盖字符验证整件unsupported，无空白假hit。
3. 同50冻结SVG逐张核原SHA不变，生成真实小PNG并检查文字区域；冻结样本不得重造。只加载50个小原件/单个Store，不复制503大样本。
4. 缓存命中不再读解原件；冷/暖文本转换、坏缓存再生、并发合并、撤权/源替换晚结果不发布、真实HTTP读取派生均走既有接口测试。
5. 外部file/http/data font/image/CSS、DTD、过量text/tspan/定位列表、超大画布与不支持布局拒绝；不发生资源访问。不因文字扩展解除其他保护。
6. 作者局部测试+不同代理独审后，再决定是否重跑必要正式性能phase。当前50张Latin通过也不能称Android实包已渲染或全部字体效果支持；双端最终包验证另记。

## 官方与源码依据

- [Noto CJK Sans部署格式与覆盖说明](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/README.md)
- [Noto CJK Sans OFL许可](https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/LICENSE)
- [完整SC Regular元数据](https://api.github.com/repos/notofonts/noto-cjk/contents/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf)
- [地区SC子集元数据](https://api.github.com/repos/notofonts/noto-cjk/contents/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf)
- [Google Fonts变量SC元数据](https://api.github.com/repos/google/fonts/contents/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf)
- [fontdb 0.23.0实际Binary/load_font_source接口](https://github.com/RazrFalcon/fontdb/blob/v0.23.0/src/lib.rs)
- 本地锁定源码：`/Users/water/.cargo/registry/src/mirrors.ustc.edu.cn-38d0e5eb5da2abae/{resvg,usvg}-0.45.1`；重点usvg `parser/options.rs`、`text/mod.rs`及`text/layout.rs`，未以较新版本API替代当前接口。


## 作者实现补记

实施采用本方案完整静态Regular，源码资产与OFL唯一存于`src-tauri/fonts`。
`svg_text.rs`将文字与vector-only分支分开；后者不调用字体初始化并保留普通
stylesheet/local paint。文字profile拒绝style元素/外部或转义CSS，style属性
仅允许明确属性。名义cmap与可信outline预检后，还逐个usvg chunk/style span
比较其原文和`layouted().positioned_glyphs`原文，检查实际glyph ID/outline，
并将XML源文字与解析后chunks核对，避免整个节点被丢弃后误判成功。复杂或
歧义multi-glyph cluster可typed unsupported。密集小压力用例将前后轮廓预算
固定为100000；1024字/128span/4096定位预算保持。转换失败标志是每次渲染
独立的，fallback恒None，不反复返回已使用face。

详见[作者任务与命令](../tasks/app-svg-thumbnail104.md)及该目录小型JSON证据。
50份冻结SVG逐hash和文字ROI对照通过，另有中文/繁体/tspan等像素验证；这些
是native-free同生产Rust代码局部证据，尚不声称Android实包/全部SVG字体效果、
正式503样本访问覆盖或RSS改善。独审另行进行。
