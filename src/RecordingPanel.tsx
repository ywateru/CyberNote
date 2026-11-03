import { useEffect, useRef, useState } from "react";
import { Pause, Play, StopCircle } from "lucide-react";
import { RecordingSession, createRecordingPreview } from "./recording-session";

const errText = (e: unknown): string =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);

export default function RecordingPanel({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: (file: File) => Promise<void>;
}) {
  const [status, setStatus] = useState<
    "starting" | "recording" | "paused" | "stopped" | "error"
  >("starting");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef<RecordingSession | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [levels, setLevels] = useState<number[]>([]);
  useEffect(() => {
    const capture = new RecordingSession({
      onRecording: () => setStatus("recording"),
      onStopped: (recorded) => {
        setBlob(recorded);
        setStatus("stopped");
      },
      onLevel: (level) => setLevels((v) => [...v.slice(-89), level]),
      onError: (e) => {
        setError(errText(e));
        setStatus("error");
      },
    });
    session.current = capture;
    void capture.start();
    return () => {
      capture.dispose();
      if (session.current === capture) session.current = null;
    };
  }, []);
  useEffect(() => {
    if (!blob) return;
    const preview = createRecordingPreview(blob);
    setPreviewUrl(preview.url);
    return () => preview.dispose();
  }, [blob]);
  useEffect(() => {
    if (status !== "recording") return;
    const t = setInterval(() => setSeconds((v) => v + 0.1), 100);
    return () => clearInterval(t);
  }, [status]);
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
  return (
    <div className="recording-backdrop">
      <section className="recording-sheet">
        <div className="sheet-handle" />
        <header>
          <button
            onClick={() => {
              session.current?.dispose();
              onCancel();
            }}
          >
            取消
          </button>
          <div>
            <strong>新录音</strong>
            <small>
              今天{" "}
              {new Date().toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          </div>
          <button
            disabled={!blob || busy}
            onClick={async () => {
              if (!blob) return;
              setBusy(true);
              try {
                await onDone(
                  new File(
                    [blob],
                    `新录音.${blob.type.includes("mp4") ? "m4a" : "webm"}`,
                    { type: blob.type },
                  ),
                );
              } catch (e) {
                setError(errText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            完成
          </button>
        </header>
        <div className="waveform">
          <div className="wave-bars">
            {levels.map((h, i) => (
              <i key={i} style={{ height: `${h}px` }} />
            ))}
          </div>
          <div className="recording-playhead" />
        </div>
        {error ? (
          <p className="recording-error">{error}</p>
        ) : (
          <>
            <div className="recording-time">{time}</div>
            <p className="recording-subtitle">
              {status === "recording"
                ? "正在录音"
                : status === "paused"
                  ? "已暂停"
                  : status === "stopped"
                    ? "录音已完成"
                    : "正在准备麦克风…"}
            </p>
            <div className="recording-controls">
              <button
                disabled={!session.current?.recorder || status === "stopped"}
                aria-label={status === "paused" ? "继续录音" : "暂停录音"}
                onClick={() => {
                  if (status === "recording") {
                    if (session.current?.pause()) setStatus("paused");
                  } else if (status === "paused") {
                    if (session.current?.resume()) setStatus("recording");
                  }
                }}
              >
                {status === "paused" ? (
                  <Play fill="currentColor" />
                ) : (
                  <Pause fill="currentColor" />
                )}
              </button>
              <button
                disabled={!session.current?.recorder || status === "stopped"}
                aria-label="结束录音"
                onClick={() => {
                  session.current?.stop();
                }}
              >
                <StopCircle size={30} />
              </button>
            </div>
            {blob && previewUrl && <audio controls src={previewUrl} />}
          </>
        )}
      </section>
    </div>
  );
}
