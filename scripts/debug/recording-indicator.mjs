import { resolve } from "node:path";
import {
  api,
  state,
  idle,
  snapshot,
  saveJSON,
  waitForState,
} from "./runtime.mjs";

export async function runRecordingIndicator(
  runtime,
  { command, check, output },
) {
  const page = runtime.page,
    metrics = [];
  const dock = ".recording-dock",
    done = dock + " .recording-done",
    close = dock + " .recording-cancel",
    primary = dock + " .recording-primary";
  const cardCount = (node) =>
    (node?.type === "attachment" ? 1 : 0) +
    (node?.content || []).reduce((sum, child) => sum + cardCount(child), 0);
  const capture = async (name) => {
    await saveJSON(
      resolve(output, name + ".snapshot.json"),
      await snapshot(page, {
        selector: ".app",
        maxChars: 40000,
        maxNodes: 160,
      }),
    );
    await page.screenshot({ path: resolve(output, name + ".png") });
  };
  const phase = async (value) => {
    await page.waitForSelector(`${dock} [data-recording-state="${value}"]`);
  };
  const badges = () => page.locator(".recording-note-badge");
  const live = () => page.locator(".live-recording-card");
  const active = async (owner) => {
    await page.waitForFunction(
      (owner) =>
        document
          .querySelector(".recording-note-badge")
          ?.getAttribute("data-recording-owner") === owner,
      owner,
    );
    check(
      "Only capture owner " + owner + " has one recording badge",
      (await badges().count()) === 1 &&
        (await badges().innerText()) === "录音中",
    );
    check(
      "Only live recording card carries recording activity",
      (await live().count()) === 1 &&
        (await page
          .locator(".live-recording-status.recording-active")
          .count()) === 1 &&
        (await page.locator(".audio-card .recording-active").count()) === 0,
    );
  };
  const begin = async () => {
    await command("recording.open");
    await page.locator(primary).click();
    await phase("recording");
  };
  const advance = (ms) =>
    page.evaluate((ms) => window.__DEBUG_PLATFORM__.advance(ms), ms);
  const finishWait = async () => {
    await page.waitForFunction(
      () => !document.querySelector(".recording-dock"),
    );
    await idle(page);
  };
  const decodeLatest = async (label, minimum) => {
    const attachment = runtime.backend.workspace.attachments
      .filter((item) => item.kind === "audio")
      .at(-1);
    const encoded = runtime.backend.files.get(attachment.id),
      bytes = Buffer.from(encoded, "base64");
    const decoded = await page.evaluate(async (base64) => {
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(
          Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer,
        );
        let peak = 0;
        for (const value of buffer.getChannelData(0))
          peak = Math.max(peak, Math.abs(value));
        return { duration: buffer.duration, length: buffer.length, peak };
      } finally {
        await context.close();
      }
    }, encoded);
    metrics.push({
      label,
      attachment: {
        id: attachment.id,
        noteId: attachment.noteId,
        mime: attachment.mime,
      },
      bytes: bytes.length,
      decoded,
    });
    check(
      label +
        " actual accumulated WAV independently decodes with complete active duration and nonzero audio",
      attachment.noteId === "note-a" &&
        bytes.subarray(0, 4).toString() === "RIFF" &&
        decoded.duration >= minimum &&
        decoded.peak > 0.01 &&
        decoded.length > 0,
    );
  };
  const rememberStateCallback = async () =>
    page.locator(".recording-local-panel").evaluate((element) => {
      let fiber =
        element[
          Object.keys(element).find((key) => key.startsWith("__reactFiber$"))
        ];
      while (fiber) {
        const props = fiber.memoizedProps;
        if (
          typeof props?.onState === "function" &&
          typeof props?.onRevision === "function"
        ) {
          window.__indicatorOldCallback = props.onState;
          return true;
        }
        fiber = fiber.return;
      }
      return false;
    });

  await command("editor.setContent", {
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "needle 长标题".repeat(12) }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "owner A body" }],
        },
      ],
    },
  });
  await command("app.flush");
  const original = JSON.stringify((await state(page)).editorJSON);
  await command("recording.open");
  check(
    "Idle preparation has no active recording badge or fake activity card",
    (await badges().count()) === 0 &&
      (await live().count()) === 0 &&
      (await page.locator(done).isDisabled()),
  );
  await page.locator(primary).click();
  await phase("recording");
  await active("note-a");
  await page.waitForFunction(
    () => !document.querySelector(".recording-dock .recording-done").disabled,
  );
  check(
    "Recording controller canFinish is reflected by enabled actual desktop checkmark",
    (await state(page)).recording.state.canFinish &&
      (await page.locator(done).isEnabled()),
  );
  check(
    "Activity decorations do not alter document JSON before a checkpoint",
    JSON.stringify((await state(page)).editorJSON) === original,
  );
  const animation = await badges()
    .locator(".recording-activity-dot")
    .evaluate((node) => getComputedStyle(node).animationName);
  check(
    "Recording dot has state pulse animation rather than synthetic level bars",
    animation === "recording-capture-pulse",
  );
  await advance(2000);
  await command("editor.insertText", { text: " UNDO-INDICATOR-78" });
  await advance(300);
  await command("editor.undo");
  check(
    "Activity updates do not intercept real editor Undo history",
    !(await state(page)).editorJSON.content.some((node) =>
      JSON.stringify(node).includes("UNDO-INDICATOR-78"),
    ),
  );
  await command("editor.redo");
  check(
    "Real editor Redo restores only user edit",
    JSON.stringify((await state(page)).editorJSON).includes(
      "UNDO-INDICATOR-78",
    ) &&
      !JSON.stringify((await state(page)).editorJSON).includes(
        "recording-active",
      ),
  );
  check(
    "Actual production onState callback retained for stale-delivery regression",
    await rememberStateCallback(),
  );
  const oldState = (await state(page)).recording.state;
  await command("note.select", { id: "note-b" });
  await command("editor.insertText", { text: " B edit during A indicator" });
  await command("app.flush");
  await active("note-a");
  check(
    "Switching B keeps original A card parked and no live card in B editor",
    (await page.locator(".tiptap:visible .live-recording-card").count()) ===
      0 && (await state(page)).selection.noteId === "note-b",
  );
  await command("search.set", { query: "B edit" });
  check(
    "Filtering original A out hides badge without stopping capture",
    (await badges().count()) === 0 &&
      (await state(page)).recording.state.phase === "recording",
  );
  await command("search.set", { query: "" });
  await active("note-a");
  await command("tag.select", { name: null });
  check(
    "Tag filter hides owner without transferring badge or ending capture",
    (await badges().count()) === 0 &&
      (await state(page)).recording.state.phase === "recording",
  );
  await command("folder.select", { id: "default" });
  await active("note-a");
  await command("settings.update", { settings: { listWidth: 220 } });
  await command("search.set", { query: "needle" });
  const layout = async () =>
    page.locator('.note-row[data-note-id="note-a"]').evaluate((row) => {
      const title = row
          .querySelector(".note-row-title strong")
          .getBoundingClientRect(),
        badge = row
          .querySelector(".recording-note-badge")
          .getBoundingClientRect(),
        rect = row.getBoundingClientRect();
      return {
        title: title.toJSON(),
        badge: badge.toJSON(),
        row: rect.toJSON(),
        highlighted: !!row.querySelector("strong .search-match"),
      };
    });
  let geometry = await layout();
  metrics.push({ label: "narrow-list", geometry });
  check(
    "220px long highlighted title and recording badge neither overlap nor overflow",
    geometry.title.right <= geometry.badge.left &&
      geometry.badge.right <= geometry.row.right &&
      geometry.highlighted,
  );
  await capture("indicator-narrow-list");
  await command("settings.update", { settings: { view: "gallery" } });
  geometry = await layout();
  metrics.push({ label: "gallery", geometry });
  check(
    "Gallery caption retains owner badge without title overlap",
    geometry.title.right <= geometry.badge.left &&
      geometry.badge.right <= geometry.row.right,
  );
  await capture("indicator-gallery");
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    "Reduced-motion preserves readable red badge while disabling dot movement",
    (await badges().innerText()) === "录音中" &&
      (await badges()
        .locator(".recording-activity-dot")
        .evaluate((node) => getComputedStyle(node).animationName === "none")),
  );
  check(
    "Reduced-motion also stops live-card indicator animation",
    await page
      .locator(".live-recording-status .recording-activity-dot")
      .evaluate((node) => getComputedStyle(node).animationName === "none"),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await command("settings.update", {
    settings: { view: "list", listWidth: 280 },
  });
  await command("search.set", { query: "" });
  await command("note.select", { id: "note-b" });
  await page.locator(primary).click();
  await phase("paused");
  await idle(page);
  check(
    "Pause checkpoint stops active badges and live-card pulse with accurate paused text",
    (await badges().count()) === 0 &&
      (await page
        .locator(".live-recording-status.recording-active")
        .count()) === 0 &&
      (await page.locator(".live-recording-status").innerText()) === "已暂停",
  );
  check(
    "Pause commits one original A card while B edits remain untouched",
    cardCount(
      (await state(page)).workspace.notes.find((note) => note.id === "note-a")
        .document,
    ) === 1 &&
      (await state(page)).workspace.notes
        .find((note) => note.id === "note-b")
        .plainText.includes("B edit during A indicator"),
  );
  await advance(5000);
  await page.locator(primary).click();
  await phase("recording");
  await active("note-a");
  await advance(1500);
  await page.evaluate(() =>
    window.__DEBUG_PLATFORM__.configure({ delay: { store: 150 } }),
  );
  await page.locator(done).click();
  await page.waitForFunction(
    () => !document.querySelector(".recording-note-badge"),
  );
  if (await page.locator(close).count()) await page.locator(close).click();
  await finishWait();
  let s = await state(page);
  check(
    "Actual recording checkmark plus repeated close shares final save and cleans all activity",
    !s.recording.active &&
      !runtime.backend.local &&
      (await badges().count()) === 0 &&
      (await live().count()) === 0 &&
      cardCount(
        s.workspace.notes.find((note) => note.id === "note-a").document,
      ) === 1 &&
      cardCount(
        s.workspace.notes.find((note) => note.id === "note-b").document,
      ) === 0,
  );
  await decodeLatest("Checkmark after pause/resume", 3.8);
  await page.evaluate(
    (state) =>
      window.__indicatorOldCallback({
        ...state,
        sequence: state.sequence + 1000,
        phase: "recording",
      }),
    oldState,
  );
  check(
    "Late completed-ticket callback cannot resurrect an activity badge or card",
    (await badges().count()) === 0 && (await live().count()) === 0,
  );
  await command("recording.open");
  await page.locator(primary).click();
  await phase("recording");
  await active("note-b");
  await page.evaluate(
    (state) =>
      window.__indicatorOldCallback({
        ...state,
        sequence: state.sequence + 2000,
        phase: "recording",
      }),
    oldState,
  );
  check(
    "Old A callback cannot override newer B session owner",
    (await badges().getAttribute("data-recording-owner")) === "note-b" &&
      (await badges().count()) === 1,
  );
  await advance(500);
  await page.locator(close).click();
  await finishWait();

  await runtime.reset();
  await begin();
  await active("note-a");
  await advance(1500);
  await page.locator(close).click();
  await finishWait();
  check(
    "Actual recording close button follows same final original-owner save",
    runtime.backend.completed?.saved &&
      runtime.backend.workspace.attachments.length === 1 &&
      cardCount(
        runtime.backend.workspace.notes.find((note) => note.id === "note-a")
          .document,
      ) === 1 &&
      (await badges().count()) === 0,
  );
  await decodeLatest("Close while recording", 1.4);
  await begin();
  await advance(400);
  await page.locator(done).click();
  await finishWait();
  await begin();
  await active("note-a");
  check(
    "Two actual saved audio cards remain static while only current live card animates",
    (await page.locator(".tiptap:visible .audio-card").count()) === 2 &&
      (await page.locator(".audio-card .recording-active").count()) === 0 &&
      (await page
        .locator(".live-recording-status.recording-active")
        .count()) === 1,
  );
  await capture("indicator-multiple-saved-cards");
  await advance(400);
  await page.locator(close).click();
  await finishWait();

  for (const boundary of ["store", "save"]) {
    await runtime.reset();
    await begin();
    await advance(1200);
    await page.evaluate(
      (boundary) =>
        window.__DEBUG_PLATFORM__.configure({
          fail: { [boundary]: boundary === "save" ? 2 : 1 },
        }),
      boundary,
    );
    await page.locator(done).click();
    await phase("retry");
    await page.waitForFunction(
      () => !document.querySelector(".recording-note-badge"),
    );
    check(
      boundary +
        " failure stops all capture activity but retains same retry owner and media",
      (await badges().count()) === 0 &&
        (await page
          .locator(".live-recording-status.recording-active")
          .count()) === 0 &&
        (await page.locator(".live-recording-status").innerText()) ===
          "录音保存待重试" &&
        (await state(page)).recording.active &&
        !!runtime.backend.local,
    );
    await capture("indicator-" + boundary + "-retry");
    if (boundary === "save") {
      await page.locator(".error-banner button:first-of-type").click();
      const recovered = await waitForState(
        page,
        (state) =>
          state.save.failed === 0 &&
          state.save.saving === 0 &&
          state.save.pending === 0,
      );
      check(
        "Body error-banner real retry acknowledges pending body before final checkmark",
        recovered.recording.active &&
          recovered.save.failed === 0 &&
          (await page.locator(".error-banner").count()) === 0,
      );
    }
    await page.locator(done).click();
    await finishWait();
    check(
      boundary +
        " actual DOM retry finishes one owner card without duplication",
      cardCount(
        runtime.backend.workspace.notes.find((note) => note.id === "note-a")
          .document,
      ) === 1 &&
        runtime.backend.workspace.attachments.length === 1 &&
        !runtime.backend.local &&
        (await live().count()) === 0,
    );
  }
  await runtime.reset();
  await begin();
  await advance(1200);
  await page.evaluate(() =>
    window.__DEBUG_PLATFORM__.configure({ delay: { store: 300 } }),
  );
  await page.locator(primary).click();
  await phase("saving");
  await page.waitForFunction(
    () => !document.querySelector(".recording-note-badge"),
  );
  check(
    "In-flight checkpoint disables capture animation and checkmark while close stays usable",
    (await badges().count()) === 0 &&
      (await page
        .locator(".live-recording-status.recording-active")
        .count()) === 0 &&
      (await page.locator(done).isDisabled()) &&
      (await page.locator(close).isEnabled()),
  );
  await page.locator(close).click();
  await finishWait();
  check(
    "Close queued during checkpoint completes one original A body card",
    !runtime.backend.local &&
      cardCount(
        runtime.backend.workspace.notes.find((note) => note.id === "note-a")
          .document,
      ) === 1,
  );

  await runtime.reset();
  await command("recording.open");
  await page.evaluate(() =>
    window.__DEBUG_PLATFORM__.configure({ mediaFail: { permission: 1 } }),
  );
  await page.locator(primary).click();
  await phase("error");
  check(
    "Device failure never creates a capture badge or fake active card",
    (await badges().count()) === 0 && (await live().count()) === 0,
  );
  await page.locator(close).click();
  await finishWait();
  await command("recording.open");
  check(
    "Safely cancelled error starts a clean idle session without previous activity",
    (await badges().count()) === 0 &&
      (await live().count()) === 0 &&
      (await page.locator(done).isDisabled()),
  );
  await page.locator(close).click();
  await finishWait();
  await saveJSON(resolve(output, "recording-indicator-metrics.json"), {
    metrics,
    pageErrors: runtime.errors,
    scope: runtime.metadata,
    staleDelivery:
      "Explicit test-only React fiber read retains the actual previous App onState callback; replay exercises production current-ticket guard. No production debug projection command added.",
  });
}
