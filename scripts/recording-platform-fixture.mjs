// Controlled hardware and clocks only; no product state machine or persistence logic.
export const installControlledRecording = () => {
  const p = (window.platform = {
    now: 0,
    wall: 1793743199123,
    requests: 0,
    starts: 0,
    pauses: 0,
    resumes: 0,
    stops: 0,
    trackStops: 0,
    closes: 0,
    disconnects: 0,
    cancels: 0,
    files: [],
    results: [],
    saves: [],
    recorders: [],
    intervals: new Map(),
    timeouts: new Map(),
    urls: [],
    revoked: [],
    config: {},
    snapshots: 0,
    audios: [],
    blobs: [],
    seq: 1,
  });
  Date.now = () => p.wall;
  Object.defineProperty(performance, "now", { value: () => p.now });
  window.setInterval = (fn, ms) => {
    const id = p.seq++;
    if (ms !== 50 && ms !== 100) return id;
    p.intervals.set(id, fn);
    return id;
  };
  window.clearInterval = (id) => p.intervals.delete(id);
  const realTimeout = window.setTimeout.bind(window),
    realClear = window.clearTimeout.bind(window);
  window.setTimeout = (fn, ms, ...args) => {
    if (ms !== 15000 && ms !== 5000) return realTimeout(fn, ms, ...args);
    const id = p.seq++;
    p.timeouts.set(id, fn);
    return id;
  };
  window.clearTimeout = (id) => {
    if (!p.timeouts.delete(id)) realClear(id);
  };
  p.advance = (ms, redraw = true) => {
    p.now += ms;
    p.wall += ms;
    if (redraw) [...p.intervals.values()].forEach((fn) => fn());
  };
  const track = {
    readyState: "live",
    addEventListener() {},
    removeEventListener() {},
    stop() {
      p.trackStops++;
    },
  };
  const stream = { getTracks: () => [track] };
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: () => {
        p.requests++;
        return new Promise((resolve, reject) => {
          p.permission = { resolve: () => resolve(stream), reject };
          if (!p.config.deferPermission) resolve(stream);
        });
      },
    },
  });
  class ControlledRecorder {
    static isTypeSupported() {
      return true;
    }
    constructor() {
      this.state = "inactive";
      this.mimeType = p.config.mime ?? "audio/webm;codecs=opus";
      p.recorders.push(this);
    }
    start() {
      p.starts++;
      p.startObserved = p.wall;
      if (p.config.startError) throw Error("start failed");
      this.state = "recording";
      queueMicrotask(() => {
        p.lateData = this.ondataavailable;
        p.lateStop = this.onstop;
        p.lateError = this.onerror;
      });
    }
    pause() {
      p.pauses++;
      if (p.config.pauseError) throw Error("pause failed");
      this.state = "paused";
    }
    requestData() {
      p.snapshots++;
      if (p.config.snapshotError) throw Error("snapshot failed");
    }
    resume() {
      p.resumes++;
      this.state = "recording";
    }
    stop() {
      p.stops++;
      if (p.config.stopError) throw Error("stop failed");
      this.state = "inactive";
    }
  }
  window.MediaRecorder = ControlledRecorder;
  const NativeAudio = window.Audio;
  class ControlledAudio extends EventTarget {
    constructor() {
      super();
      this.src = "";
      this.duration = NaN;
      this.readyState = 0;
      this.position = 0;
      this.paused = true;
      this.seeking = false;
      this.error = null;
      this.ranges = [];
      this.requests = [];
      p.audios.push(this);
    }
    get currentTime() {
      return this.position;
    }
    set currentTime(value) {
      this.requests.push(value);
      this.seeking = true;
    }
    get seekable() {
      const r = this.ranges;
      return { length: r.length, start: (i) => r[i][0], end: (i) => r[i][1] };
    }
    emit(name) {
      this.dispatchEvent(new Event(name));
    }
    load() {
      this.error = null;
      this.readyState = 0;
      this.duration = NaN;
      this.ranges = [];
    }
    removeAttribute(name) {
      if (name === "src") this.src = "";
    }
    pause() {
      this.paused = true;
      this.emit("pause");
    }
    play() {
      if (p.config.holdPlay)
        return new Promise((resolve) => {
          this.resolvePlay = resolve;
        });
      this.paused = false;
      this.emit("play");
      return Promise.resolve();
    }
    ready(duration = 45, ranges = [[0, 45]]) {
      this.duration = duration;
      this.ranges = ranges;
      this.readyState = 2;
      this.emit("loadedmetadata");
      this.emit("canplay");
    }
    confirm(time) {
      this.position = time;
      this.seeking = false;
      this.emit("seeked");
    }
  }
  window.Audio = function (...args) {
    return p.config.preview ? new ControlledAudio() : new NativeAudio(...args);
  };
  p.pauseEvent = () => p.recorders.at(-1).onpause?.();
  window.AudioContext = class {
    createAnalyser() {
      return {
        frequencyBinCount: 32,
        disconnect: () => p.disconnects++,
        getByteFrequencyData: (array) => array.fill(12),
      };
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect: () => p.disconnects++ };
    }
    close() {
      p.closes++;
      return Promise.resolve();
    }
  };
  p.emit = (text = "last bytes", stopped = true) => {
    const r = p.recorders.at(-1);
    r.ondataavailable?.({ data: new Blob([text], { type: r.mimeType }) });
    if (stopped) r.onstop?.();
  };
  p.timeout = () => [...p.timeouts.values()].forEach((fn) => fn());
  URL.createObjectURL = (blob) => {
    p.blobs.push(blob);
    const url = "blob:controlled-" + p.urls.length;
    p.urls.push(url);
    return url;
  };
  URL.revokeObjectURL = (url) => p.revoked.push(url);
};
