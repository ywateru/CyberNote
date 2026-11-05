# 73 修复后独立复验

受审 HEAD818d51d6（与 df3e5c42 产品/runner 输入相同），baseline3534acaf。结论及限制见 [新复审报告](../../../plan/reviews/app-mobile-recording-primary73-recheck.md)。父目录的首次 blocked 证据未覆盖。

- build、desktop100、recording43、notes9、production、visual 六项均自然退出0；各目录 process.json 是独立外部 wall/退出码，summary/suite 是正式 runner 输出。
- recording 保全600ms delayed read的实际 readiness，以及合成 PCM/WAV 解码、保存重试和后段播放证明。
- visual/raw-render-inputs.zip 保全 before/after 全部 PNG、六桌面 HTML/computed、原始参考；纯压缩，无裁图改写。正式18手机矩阵/6桌面结果在summary。
- independent-projections 是独立 Chrome 对原图与正式全帧截图统一解码/投影的9图。independent-color.mjs.txt与independent-quant.py.txt保存精确脚本；independent-quant.json保存原图SHA、PNG色元数据、raw/browser分离主色、ROI和轮廓指标。
- independent-desktop-check.py.txt与independent-desktop-pixels.json保存独立六桌面严格比较；source-proof.json证明View没变、只有CSS变化。
- external-process-wrapper.py.txt为计时原脚本。历史临时绝对路径表示这次精确运行输入；重放时改为自己的解包/输出目录即可，不需设备、mic或用户音频。
- sha256.json覆盖证据文件（生成时不含本README与清单自身）。7输入视觉指纹与78输入App CLI指纹是不同集合，不混称。

视觉自然完成259.887s，仍是测试效率残差。局部图像误差下降不等于整体逐像素一致，原生与用户最终目标继续开放。
