import { resolve } from "node:path";
import {
  api,
  idle,
  state,
  snapshot,
  saveJSON,
  waitForState,
} from "./runtime.mjs";

// Mobile owns one MediaRecorder session and pauses for preview; it does not
// implement the desktop cumulative checkpoint contract.
export async function runMobileRecording(
  runtime,
  { command, check, output, exercised },
) {
  const { page, backend } = runtime;
  const waitRecording = async (predicate) =>
    (
      await waitForState(page, (s) => predicate(s.recording.state), {
        label: "mobile recording projection",
      })
    ).recording.state;
  const phase = async (name) =>
    page.waitForSelector(`.recording-mobile [data-recording-state="${name}"]`);
  const advance = async (ms) =>
    page.evaluate((ms) => window.__DEBUG_PLATFORM__.advance(ms), ms);
  const configure = async (value) =>
    page.evaluate((value) => window.__DEBUG_PLATFORM__.configure(value), value);
  const cards = (node) => [
    ...(node?.type === "attachment" ? [node.attrs.id] : []),
    ...(node?.content || []).flatMap(cards),
  ];
  const note = (id = "note-a") =>
    backend.workspace.notes.find((n) => n.id === id);
  const capture = async (name, selector = ".recording-mobile") => {
    await saveJSON(
      resolve(output, `mobile-${name}.snapshot.json`),
      await snapshot(page, { selector, maxChars: 24000, maxNodes: 100 }),
    );
    await page.screenshot({ path: resolve(output, `mobile-${name}.png`) });
  };
  const reject = async (action, code, args = {}) => {
    let error;
    try {
      await command("recording.action", { action, ...args });
    } catch (e) {
      error = e;
    }
    check(`Mobile ${action} reports ${code}`, error?.code === code);
  };
  const start = async () => {
    await command("note.select", { id: "note-a" });
    await command("recording.open");
    await command("recording.action", { action: "toggle" });
    await phase("recording");
  };

  await command("note.select", { id: "note-a" });
  await command("recording.open");
  await phase("idle");
  await capture("idle");
  check(
    "Mobile initial real HTML has modal sheet, enabled close/start and disabled Done/playback",
    (await page
      .locator('.recording-mobile [role="dialog"][aria-modal="true"]')
      .count()) === 1 &&
      (await page.locator(".recording-cancel").isEnabled()) &&
      (await page.locator(".recording-primary").isEnabled()) &&
      (await page.locator(".recording-done").isDisabled()) &&
      (await page
        .locator(".recording-playback button")
        .evaluateAll((nodes) => nodes.every((node) => node.disabled))),
  );
  await reject("finish", "UNAVAILABLE");
  await reject("playback", "UNAVAILABLE");
  await reject("seek", "UNAVAILABLE", { milliseconds: 0 });
  await command("recording.action", { action: "close" });
  check(
    "Mobile empty close cancels without requesting device or storing attachment",
    !(await state(page)).recording.active &&
      backend.workspace.attachments.length === 0 &&
      (await page.evaluate(() => window.__DEBUG_PLATFORM__.streams === 0)),
  );

  await start();
  await advance(2000);
  await capture("recording");
  check(
    "Mobile active Done and playback remain disabled and semantic state agrees",
    (await page.locator(".recording-done").isDisabled()) &&
      !(await state(page)).recording.state.canFinish &&
      (await page
        .locator(".recording-playback button")
        .evaluateAll((nodes) => nodes.every((node) => node.disabled))),
  );
  await reject("finish", "UNAVAILABLE");
  await command("recording.action", { action: "toggle" });
  await phase("paused");
  await waitRecording((s) => s?.canPlay);
  let s = await state(page);
  const firstElapsed = s.recording.state.elapsed;
  check(
    "Mobile pause prepares actual decodable preview without desktop checkpoint writes",
    firstElapsed >= 2000 &&
      firstElapsed < 4000 &&
      s.recording.state.canFinish &&
      backend.workspace.attachments.length === 0,
  );
  await command("recording.action", { action: "playback" });
  await waitRecording((s) => s?.playing);
  check(
    "Mobile preview plays in actual browser media element and disables resume",
    (await state(page)).recording.state.playing &&
      (await page.locator(".recording-primary").isDisabled()),
  );
  await reject("toggle", "UNAVAILABLE");
  await command("recording.action", { action: "playback" });
  await waitRecording((s) => s && !s.playing);
  s = await state(page);
  check(
    "Mobile preview pause is observed and seek capability follows actual media ranges",
    !s.recording.state.playing &&
      s.recording.state.canSeek &&
      s.recording.state.seekable.length > 0,
  );
  await command("recording.action", { action: "seek", milliseconds: 700 });
  check(
    "Mobile seek reports actual media time",
    Math.abs((await state(page)).recording.state.position - 700) < 500,
  );
  await command("recording.action", { action: "skip", seconds: -15 });
  check(
    "Mobile backward skip clamps to actual start",
    (await state(page)).recording.state.position < 500,
  );
  await command("recording.action", { action: "skip", seconds: 15 });
  check(
    "Mobile forward skip clamps to actual prefix end",
    Math.abs((await state(page)).recording.state.position - firstElapsed) < 500,
  );
  await reject("seek", "UNAVAILABLE", { milliseconds: 120000 });
  await advance(5000);
  await command("recording.action", { action: "toggle" });
  await advance(3000);
  await command("recording.action", { action: "toggle" });
  await phase("paused");
  await waitRecording((s) => s?.canPlay);
  s = await state(page);
  const secondElapsed = s.recording.state.elapsed;
  check(
    "Mobile resume accumulates active time and excludes five-second paused gap",
    secondElapsed - firstElapsed >= 3000 &&
      secondElapsed - firstElapsed < 5000 &&
      secondElapsed >= 5000 &&
      secondElapsed < 9000,
  );
  await capture("paused");
  await command("recording.action", { action: "seek", milliseconds: 4000 });
  await command("recording.action", { action: "playback" });
  const laterPreview = await waitRecording(
    (s) => s?.playing && s.previewPosition && s.position > 4150,
  );
  await saveJSON(
    resolve(output, "later-preview-diagnostic.json"),
    laterPreview,
  );
  check(
    "Mobile second preview really plays after first pause boundary",
    laterPreview.playing &&
      laterPreview.previewPosition &&
      laterPreview.position > 4150,
  );
  await command("recording.action", { action: "playback" });
  await configure({ mediaFail: { play: 1 } });
  await reject("playback", "APP_ERROR");
  s = await state(page);
  await capture("preview-failure");
  check(
    "Mobile real play rejection retains paused capture and exposes retry",
    s.recording.active &&
      s.recording.state.phase === "paused" &&
      s.recording.state.hasError &&
      s.recording.state.canRetryPreview &&
      backend.workspace.attachments.length === 0,
  );
  await command("recording.action", { action: "preview-retry" });
  await waitRecording((s) => s?.playing);
  check(
    "Mobile preview retry clears actual error and plays same retained prefix",
    !(await state(page)).recording.state.hasError &&
      (await state(page)).recording.state.playing,
  );
  await command("recording.action", { action: "playback" });
  await command("recording.action", { action: "finish" });
  s = await state(page);
  check(
    "Mobile finish waits for original A body ACK and yields exactly one card without touching B",
    !s.recording.active &&
      s.save.pending === 0 &&
      s.save.failed === 0 &&
      cards(note().document).length === 1 &&
      cards(note("note-b").document).length === 0 &&
      note("note-b").plainText === "Fixture B" &&
      backend.workspace.attachments.length === 1 &&
      [...backend.journal.values()].every((entry) =>
        ["stored", "committed"].includes(entry.status),
      ),
  );
  const attachment = backend.workspace.attachments[0];
  const decoded = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const context = new AudioContext({ sampleRate: 24000 });
    try {
      const byteLength = bytes.byteLength;
      const audio = await context.decodeAudioData(bytes.buffer);
      const samples = audio.getChannelData(0);
      let energy = 0,
        tail = 0;
      for (let i = 0; i < samples.length; i++) {
        energy += samples[i] ** 2;
        if (i > 24000 * 4) tail += samples[i] ** 2;
      }
      return {
        bytes: byteLength,
        duration: audio.duration,
        frames: audio.length,
        sampleRate: audio.sampleRate,
        rms: Math.sqrt(energy / samples.length),
        tailEnergyAfter4s: tail,
      };
    } finally {
      await context.close();
    }
  }, backend.files.get(attachment.id));
  check(
    "Mobile stored bytes really decode cumulative active audio including nonzero later samples",
    decoded.duration >= 5 &&
      decoded.duration < 9 &&
      Math.abs(decoded.duration - secondElapsed / 1000) < 0.15 &&
      decoded.frames > 120000 &&
      decoded.rms > 0.01 &&
      decoded.tailEnergyAfter4s > 1,
  );
  await saveJSON(resolve(output, "mobile-media-proof.json"), {
    firstElapsed,
    secondElapsed,
    decoded,
    attachment: {
      id: attachment.id,
      mime: attachment.mime,
      size: attachment.size,
    },
    backend: backend.kind,
  });
  await capture("saved", ".editor-scroll:not([hidden]) .tiptap");
  await command("note.select", { id: "note-b" });
  await command("note.select", { id: "note-a" });
  await command("dom.click", {
    selector: ".editor-scroll:not([hidden]) .tiptap .audio-title-toggle",
  });
  await command("dom.fill", {
    selector: ".editor-scroll:not([hidden]) .tiptap .audio-detail input",
    value: "4",
  });
  await command("dom.click", {
    selector: ".editor-scroll:not([hidden]) .tiptap .audio-play-toggle",
  });
  await page.waitForFunction(() => {
    const audio = document.querySelector(".tiptap .audio-card audio");
    return audio && !audio.paused && audio.currentTime > 4.1;
  });
  check(
    "Mobile saved card remounts from persisted bytes and really plays beyond first segment",
    await page
      .locator(".editor-scroll:not([hidden]) .tiptap .audio-card audio")
      .evaluate((audio) => !audio.paused && audio.currentTime > 4.1),
  );
  await command("dom.click", {
    selector: ".editor-scroll:not([hidden]) .tiptap .audio-play-toggle",
  });
  check(
    "Mobile successful capture stops device track and revokes obsolete preview URLs",
    await page.evaluate(
      () =>
        window.__DEBUG_PLATFORM__.trackStops >= 1 &&
        window.__DEBUG_PLATFORM__.objectURLs.revoked >= 2,
    ),
  );

  await runtime.reset();
  await start();
  await advance(1300);
  await command("recording.action", { action: "close" });
  check(
    "Mobile active close seals and stores audio with body ACK",
    !(await state(page)).recording.active &&
      cards(note().document).length === 1 &&
      backend.workspace.attachments.length === 1 &&
      (await state(page)).save.pending === 0,
  );
  await runtime.reset();
  await command("note.select", { id: "note-a" });
  await command("recording.open");
  await configure({ mediaFail: { permission: 1 } });
  await reject("toggle", "APP_ERROR");
  await phase("error");
  await capture("device-failure");
  check(
    "Mobile device rejection is visible and stores no empty attachment",
    (await state(page)).recording.state.hasError &&
      backend.workspace.attachments.length === 0,
  );
  await command("recording.action", { action: "close" });
  check(
    "Mobile failed empty capture can close and release owner",
    !(await state(page)).recording.active,
  );

  // Deliberate storage and body faults are separate: a stored attachment is not
  // the same evidence as an acknowledged editor body.
  for (const boundary of ["store", "save"]) {
    await runtime.reset();
    await start();
    await advance(1400);
    await command("recording.action", { action: "toggle" });
    await configure({
      delay: { [boundary]: 180 },
      fail: { [boundary]: boundary === "save" ? 2 : 1 },
    });
    const started = performance.now();
    let completed = false;
    const observed = command("recording.action", { action: "finish" }).then(
      () => {
        completed = true;
        return null;
      },
      (error) => {
        completed = true;
        return error;
      },
    );
    await waitRecording((s) => s?.phase === "saving");
    check(
      `Mobile delayed ${boundary} remains genuinely busy before ACK`,
      !completed && (await state(page)).busy,
    );
    const error = await observed;
    check(
      `Mobile delayed ${boundary} failure reports APP_ERROR after real boundary delay`,
      error?.code === "APP_ERROR" && performance.now() - started >= 150,
    );
    await phase("retry");
    s = await state(page);
    check(
      `Mobile ${boundary} failure keeps same recoverable session and no duplicate card`,
      s.recording.active &&
        s.recording.state.hasError &&
        cards(s.workspace.notes.find((n) => n.id === "note-a").document)
          .length <= 1,
    );
    await capture(`${boundary}-failure`);
    if (boundary === "save") {
      let retainedFailure;
      try {
        await idle(page);
      } catch (error) {
        retainedFailure = error;
      }
      check(
        "Mobile failed body without retry still reports APP_ERROR",
        retainedFailure?.code === "APP_ERROR",
      );
      await configure({ delay: { save: 180 }, fail: { save: 10 } });
      const failedRetryAt = performance.now();
      let retryFinished = false;
      const failedRetry = command("dom.click", {
        selector: ".error-banner button:first-of-type",
      }).then(
        () => {
          retryFinished = true;
          return null;
        },
        (error) => {
          retryFinished = true;
          return error;
        },
      );
      const duringFailedRetry = await waitForState(
        page,
        (s) => s.save.saving > 0,
      );
      check(
        "Mobile retry waits while old failure and real save coexist",
        !retryFinished &&
          duringFailedRetry.save.failed > 0 &&
          duringFailedRetry.busy,
      );
      const retryError = await failedRetry;
      const afterFailedRetry = await state(page);
      check(
        "Mobile retry failing again reports APP_ERROR only after real work settles",
        retryError?.code === "APP_ERROR" &&
          performance.now() - failedRetryAt >= 150 &&
          afterFailedRetry.save.saving === 0 &&
          afterFailedRetry.save.failed > 0 &&
          afterFailedRetry.recording.active,
      );
      await configure({ delay: { save: 180 }, fail: { save: 0 } });
      const successAt = performance.now();
      let successFinished = false;
      const retrySuccess = command("dom.click", {
        selector: ".error-banner button:first-of-type",
      }).then(
        (value) => {
          successFinished = true;
          return value;
        },
        (error) => {
          successFinished = true;
          throw error;
        },
      );
      // Attach rejection admission immediately while observing the genuine
      // queued retry, so a failure cannot become an unhandled rejection.
      void retrySuccess.catch(() => {});
      const duringSuccess = await waitForState(page, (s) => s.save.saving > 0);
      check(
        "Mobile delayed successful retry does not reject the retained old failure",
        !successFinished && duringSuccess.save.failed > 0 && duringSuccess.busy,
      );
      await retrySuccess;
      check(
        "Mobile delayed successful retry waits for body ACK",
        performance.now() - successAt >= 150 &&
          (await state(page)).save.failed === 0,
      );
      await saveJSON(resolve(output, "mobile-retry-proof.json"), {
        duringFailedRetry: {
          save: duringFailedRetry.save,
          busy: duringFailedRetry.busy,
        },
        failedRetry: {
          code: retryError?.code,
          save: afterFailedRetry.save,
          ownerRetained: afterFailedRetry.recording.active,
        },
        duringSuccess: { save: duringSuccess.save, busy: duringSuccess.busy },
        success: {
          elapsedMs: Math.round(performance.now() - successAt),
          save: (await state(page)).save,
        },
      });
    } else {
      await configure({ delay: { store: 0 }, fail: { store: 0 } });
      await command("recording.action", { action: "finish" });
    }
    s = await state(page);
    check(
      `Mobile ${boundary} retry acknowledges retained bytes once without duplicate store`,
      !s.recording.active &&
        s.save.pending === 0 &&
        s.save.failed === 0 &&
        backend.workspace.attachments.length === 1 &&
        cards(note().document).length === 1 &&
        [...backend.journal.values()].length === 1 &&
        [...backend.journal.values()].every((entry) =>
          ["stored", "committed"].includes(entry.status),
        ),
    );
  }
}
