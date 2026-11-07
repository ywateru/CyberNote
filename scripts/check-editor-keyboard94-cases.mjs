import assert from "node:assert/strict";

// Uses check-tags-browser's real React NoteEditor, schema and browser keyboard.
export async function runKeyboard94Checks({ page, mount, note, snapshot, results }) {
  let failures = 0;
  const check = async (name, run) => {
    try {
      await run();
      results.push({ name, ok: true });
    } catch (error) {
      failures++;
      results.push({ name, ok: false, error: String(error), snapshot: await snapshot() });
    }
  };
  const focusEnd = () => page.evaluate(() => window.editors.a.commands.focus("end"));
  for (const name of ["标签", "Project_94"]) {
    await check(`Enter commits ${name} and splits without mark leakage`, async () => {
      await mount([note("a", `#${name}`)]);
      await focusEnd();
      await page.keyboard.press("Enter");
      const s = await snapshot();
      assert.deepEqual(s.tags, [name]);
      assert.equal(s.doc.content.length, 2);
      assert.equal(s.doc.content[1].type, "paragraph");
      await page.keyboard.insertText("next");
      assert.deepEqual((await snapshot()).doc.content[1].content, [{ type: "text", text: "next" }]);
    });
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
  await check("beforeinput insertParagraph without keydown commits and splits", async () => {
    await mount([note("a", "#Soft键盘")]);
    await focusEnd();
    await page.evaluate(() => window.editors.a.view.dom.dispatchEvent(new InputEvent("beforeinput", {
      inputType: "insertParagraph", bubbles: true, cancelable: true,
    })));
    assert.deepEqual((await snapshot()).tags, ["Soft键盘"]);
    assert.equal((await snapshot()).doc.content.length, 2);
  });
  await check("ordinary Tab inserts literal tab and retains focus with Undo", async () => {
    await mount([note("a", "left")]);
    await focusEnd();
    await page.keyboard.press("Tab");
    assert.equal((await snapshot()).text, "left\t");
    assert.equal(await page.evaluate(() => window.editors.a.view.hasFocus()), true);
    await page.evaluate(() => window.editors.a.commands.undo());
    assert.equal((await snapshot()).text, "left");
  });
  if (failures) throw Error(`${failures} keyboard94 cases failed; original results preserved`);
}
