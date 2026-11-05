// Complete MediaRecorder segments only. Never concatenate compressed containers.
export const RECORDING_SAMPLE_RATE = 24000;
export const RECORDING_MAX_BYTES = 100 * 1024 * 1024;
const HEADER_BYTES = 44;
export class RecordingPcm {
  private segments: Int16Array[] = [];
  private frames = 0;
  append(audio: AudioBuffer) {
    if (
      audio.sampleRate !== RECORDING_SAMPLE_RATE ||
      !audio.numberOfChannels ||
      !audio.length
    )
      throw Error("完整录音分段的采样格式无效，原分段仍保留，可重试。");
    if (HEADER_BYTES + (this.frames + audio.length) * 2 > RECORDING_MAX_BYTES)
      throw Error(
        "累计录音超过100 MB，原分段和上次已保存版本仍保留；请勿关闭应用。",
      );
    const channels = Array.from(
      { length: audio.numberOfChannels },
      (_, channel) => audio.getChannelData(channel),
    );
    const pcm = new Int16Array(audio.length);
    for (let i = 0; i < pcm.length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      if (!Number.isFinite(value))
        throw Error("录音包含无效采样，原分段仍保留。");
      value = Math.max(-1, Math.min(1, value));
      pcm[i] = Math.round(value < 0 ? value * 32768 : value * 32767);
    }
    this.segments.push(pcm);
    this.frames += pcm.length;
  }
  wav(): Blob {
    if (!this.frames) throw Error("录音没有可保存的音频，原分段仍保留。");
    const header = new ArrayBuffer(HEADER_BYTES),
      view = new DataView(header);
    const text = (at: number, value: string) => {
      for (let i = 0; i < value.length; i++)
        view.setUint8(at + i, value.charCodeAt(i));
    };
    text(0, "RIFF");
    view.setUint32(4, 36 + this.frames * 2, true);
    text(8, "WAVE");
    text(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, RECORDING_SAMPLE_RATE, true);
    view.setUint32(28, RECORDING_SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, this.frames * 2, true);
    // Explicit little endian output, independent of host typed-array endianness.
    const parts: BlobPart[] = [header];
    for (const segment of this.segments) {
      const bytes = new ArrayBuffer(segment.length * 2),
        data = new DataView(bytes);
      for (let i = 0; i < segment.length; i++)
        data.setInt16(i * 2, segment[i], true);
      parts.push(bytes);
    }
    return new Blob(parts, { type: "audio/wav" });
  }
}
