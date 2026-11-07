import assert from "node:assert/strict";

// Uses check-tags-browser's real React NoteEditor, schema and browser keyboard.
export async function runKeyboard94Checks({
  page,
  mount,
  note,
  snapshot,
  results,
}) {
  let failures = 0;
  const check = async (name, run) => {
    try {
      await run();
      results.push({ name, ok: true });
    } catch (error) {
      failures++;
      results.push({
        name,
        ok: false,
        error: String(error),
        snapshot: await snapshot(),
      });
    }
  };
  const focusEnd = async () => {
    await page.evaluate(() => window.editors.a.commands.focus("end"));
    await page.waitForFunction(() => window.editors.a.view.hasFocus());
  };
  for (const name of ["标签", "Project_94"]) {
    await check(
      `Enter commits ${name} and splits without mark leakage`,
      async () => {
        await mount([note("a", `#${name}`)]);
        await focusEnd();
        await page.keyboard.press("Enter");
        const s = await snapshot();
        assert.deepEqual(s.tags, [name]);
        assert.equal(s.doc.content.length, 2);
        assert.equal(s.doc.content[1].type, "paragraph");
        await page.keyboard.insertText("next");
        assert.deepEqual((await snapshot()).doc.content[1].content, [
          { type: "text", text: "next" },
        ]);
      },
    );
  }
  await check("Enter mark and split Undo/Redo as one action", async () => {
    await mount([note("a", "#Undo")]);
    await focusEnd();
    await page.keyboard.press("Enter");
    await page.evaluate(() => window.editors.a.commands.undo());
    const undone = await snapshot();
    assert.deepEqual(undone.tags, []);
    assert.equal(undone.doc.content.length, 1);
    assert.equal(undone.text, "#Undo");
    await page.evaluate(() => window.editors.a.commands.redo());
    assert.deepEqual((await snapshot()).tags, ["Undo"]);
    assert.equal((await snapshot()).doc.content.length, 2);
  });
  await check(
    "beforeinput insertParagraph without keydown commits and splits",
    async () => {
      await mount([note("a", "#Soft键盘")]);
      await focusEnd();
      await page.evaluate(() =>
        window.editors.a.view.dom.dispatchEvent(
          new InputEvent("beforeinput", {
            inputType: "insertParagraph",
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      assert.deepEqual((await snapshot()).tags, ["Soft键盘"]);
      assert.equal((await snapshot()).doc.content.length, 2);
    },
  );
  await check(
    "ordinary Tab inserts literal tab and retains focus with Undo",
    async () => {
      await mount([note("a", "left")]);
      await focusEnd();
      await page.keyboard.press("Tab");
      assert.equal((await snapshot()).doc.content[0].content[0].text, "left\t");
      assert.equal(
        await page.evaluate(() => window.editors.a.view.hasFocus()),
        true,
      );
      await page.evaluate(() => window.editors.a.commands.undo());
      assert.equal((await snapshot()).text, "left");
    },
  );
  const p = (text) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  });
  for (const kind of ["heading", "bulletList", "taskList", "table"]) {
    await check(`Enter retains existing ${kind} behavior`, async () => {
      const para = p("#Context");
      const block =
        kind === "heading"
          ? { ...para, type: "heading", attrs: { level: 2 } }
          : kind === "table"
            ? {
                type: "table",
                content: [
                  {
                    type: "tableRow",
                    content: [{ type: "tableCell", content: [para] }],
                  },
                ],
              }
            : {
                type: kind,
                content: [
                  {
                    type: kind === "taskList" ? "taskItem" : "listItem",
                    content: [para],
                  },
                ],
              };
      const n = note("a");
      n.document = { type: "doc", content: [block] };
      await mount([n]);
      await page.evaluate(() => {
        const e = window.editors.a;
        e.state.doc.descendants((node, pos) => {
          if (node.text === "#Context")
            e.commands.setTextSelection(pos + node.text.length);
        });
        e.view.focus();
      });
      await page.keyboard.press("Enter");
      const s = await snapshot();
      assert.deepEqual(s.tags, ["Context"]);
      assert.equal(s.doc.content[0].type, kind);
      if (kind.endsWith("List"))
        assert.equal(s.doc.content[0].content.length, 2);
      if (kind === "table")
        assert.equal(s.doc.content[0].content[0].content[0].content.length, 2);
    });
  }
  for (const guard of ["event-composing", "view-composing", "duplicate"]) {
    await check(`soft Enter ${guard} guard`, async () => {
      await mount([note("a", "#Soft")]);
      await focusEnd();
      if (guard === "duplicate") await page.keyboard.press("Enter");
      const before = (await snapshot()).doc;
      const prevented = await page.evaluate((guard) => {
        const dom = window.editors.a.view.dom;
        if (guard === "view-composing")
          dom.dispatchEvent(
            new CompositionEvent("compositionstart", { bubbles: true }),
          );
        const input = new InputEvent("beforeinput", {
          inputType: "insertParagraph",
          isComposing: guard === "event-composing",
          bubbles: true,
          cancelable: true,
        });
        dom.dispatchEvent(input);
        return input.defaultPrevented;
      }, guard);
      assert.equal(prevented, false);
      assert.deepEqual((await snapshot()).doc, before);
    });
  }
  for (const type of ["attachment", "drawing"]) {
    await check(`Tab preserves ${type} NodeSelection`, async () => {
      const n = note("a");
      n.document.content.unshift({
        type,
        attrs:
          type === "attachment"
            ? { id: "synthetic", name: "fixture.txt", kind: "file" }
            : { strokes: [] },
      });
      await mount([n]);
      await page.evaluate(() => {
        const e = window.editors.a;
        e.commands.setNodeSelection(0);
        e.view.focus();
      });
      const before = (await snapshot()).doc;
      await page.keyboard.press("Tab");
      assert.deepEqual((await snapshot()).doc, before);
    });
  }
  await check("blocked Enter cannot mark a same-tick later split", async () => {
    await mount([note("a", "#Blocked")]);
    await focusEnd();
    await page.evaluate(() => {
      const e = window.editors.a;
      const Plugin = e.state.plugins[0].constructor;
      const blocker = new Plugin({
        props: {
          handleKeyDown(_view, event) {
            return event.key === "Enter";
          },
        },
      });
      e.registerPlugin(blocker, (newPlugin, plugins) => {
        const i = plugins.findIndex((p) =>
          p.key.startsWith("notesCommittedTags"),
        );
        return [...plugins.slice(0, i + 1), newPlugin, ...plugins.slice(i + 1)];
      });
      e.view.dom.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          keyCode: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
      e.commands.splitBlock();
    });
    assert.deepEqual((await snapshot()).tags, []);
    assert.equal((await snapshot()).doc.content.length, 2);
  });
  if (failures)
    throw Error(
      `${failures} keyboard94 cases failed; original results preserved`,
    );
}
