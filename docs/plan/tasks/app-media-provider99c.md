---
id: app-media-provider99c
scope: native-media-thumbnail-provider
status: done
depends-on: [app-media-platform99b]
---

## objective

在已接受的受管File/租约/cache边界内增加真实视频首帧海报和平台图片降采样能力。保持已有JS thumbnail租约接口不变，与99前端消费迁移按路径隔离；最终Mac/Android整包验收仍归101。

## context

docs/architecture/attachment-media.md；src-tauri/src/attachment_media/README.md；docs/plan/tasks/app-media-performance99.md。平台内部读取的是Rust已验证的File/FD，不接受renderer路径，也不扩大asset scope。

## path

独占attachment_media的thumbnail/provider/runtime接线及独立native provider插件（若必要）、最小lib/Cargo/build注册。不得修改App、Editor、UI媒体hook、bridge、data-management或设置。先定义内部ThumbnailProvider能力，输入VerifiedFile和受限目标像素，输出有界RGBA或PNG；cache统一校验/授权/原子发布/失效依旧由已有核心负责。不可把新平台对象变成第二个授权源。

## verification

- Mac使用ImageIO降采样/EXIF与AVFoundation首帧；先做真实独立native probe确认文件描述符策略，不能从路径重新打开未验证原件。Android使用FD和BitmapFactory/MediaMetadataRetriever，区分API26/27的有界缩放能力；不允许无尺寸上界的整幅视频解码作为隐藏fallback。
- 目标尺寸、输出字节、源尺寸/像素、并发/超时与取消都有明确约束；不支持的格式或系统返回unsupported_media，原件仍可打开/导出。SVG继续受限本地rasterizer，不依赖平台共同支持SVG。
- 平台图片支持矩阵包含PNG/JPEG/GIF/WebP/BMP/SVG、HEIC/HEIF/AVIF；只声明实测支持。不能将单平台支持写成双端保证。
- 已有cache命中不重读原件、损坏恢复、撤权迟到不发布和原子缓存发布保持；真实视频生成小海报，不能用type占位或CSS缩小视频冒充。
- 使用隔离样本和native-free core回归、实际Mac provider probe；本阶段不打完整原生包、不ADB，Android实际运行在101验证。作者与独审分开，review blocker修正后再整合。

## accepted source stage

2026-11-09：作者e55a17a7，预算F1由9a6d367c修正，独立复审0ebfa9fc接受；差异已回填主目录。Mac真实FD两MP4海报、ImageIO格式/EXIF、严格32MiB读取预算、授权/cache/TCP/provider29组与Kotlin policy7有证据。最终同源实包、Android真机解码与原生RSS仍归101，不由本阶段推认。
