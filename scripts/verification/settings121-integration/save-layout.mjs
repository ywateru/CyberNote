import assert from 'node:assert/strict';
import {openRuntime} from '../../debug/runtime.mjs';
import {FakeBackend} from '../../debug/platform.mjs';
const call = FakeBackend.prototype.call;
FakeBackend.prototype.call = function(command, args) {
  if (command === 'settings_host_ready') return Promise.resolve({ok:true,value:null});
  return call.call(this, command, args);
};

for (const mobile of [false, true]) {
  const {page, backend, cleanup, errors} = await openRuntime({mobile, enabled:true, 'account-ui':true});
  try {
    await page.locator(mobile ? '.mobile-home-settings' : '.desktop-settings').click();
    await page.locator('[data-preferences-page="notes"]').click();
    const panel = page.locator('#preferences-panel-notes');
    // A short viewport ensures we test a non-zero scroll position on desktop too.
    if (!mobile) await page.setViewportSize({width:1050,height:490});
    const group = panel.getByRole('radiogroup', {name:'按日期分组'});
    for (const [label, fail] of [['关闭',false], ['开启',true]]) {
      const save = group.getByRole('radio', {name:label});
      await save.scrollIntoViewIfNeeded();
      await save.focus();
      await page.evaluate(() => {
        const panel = document.querySelector('#preferences-panel-notes');
        const control = document.activeElement;
        window.sampleSave = () => ({ panel: panel === document.querySelector('#preferences-panel-notes'), focused: control === document.activeElement, top: panel.scrollTop, controlY: control.getBoundingClientRect().y, navs: performance.getEntriesByType('navigation').length });
      });
      const before = await page.evaluate(() => window.sampleSave());
      assert(before.top > 0, 'test must exercise a scrolled panel');
      backend.configure({delay:{settings:750},fail:{settings:fail?1:0}});
      const writes = () => backend.calls.filter(c => c.command === 'workspace_action' && c.type === 'settings').length;
      const prior = writes();
      await page.keyboard.press('Space');
      await panel.getByText('正在保存…', {exact:true}).waitFor();
      assert.deepEqual(await page.evaluate(() => window.sampleSave()), before);
      await page.keyboard.press('Space'); // A second activation cannot send another write.
      await panel.getByText('更改保存后立即生效', {exact:true}).waitFor();
      assert.equal(writes(), prior + 1);
      assert.equal(await save.getAttribute('aria-checked'), String(!fail));
      assert.deepEqual(await page.evaluate(() => window.sampleSave()), before);
      if (fail) {
        assert.match(await page.locator('.preferences-error').innerText(), /Controlled settings failure/);
        assert.equal(await page.locator('.app .error-banner').count(), 0);
      }
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${mobile ? 'mobile' : 'desktop'} settings save: focused control, panel identity, scroll and geometry retained during delayed success/failure`);
  } finally { await cleanup(); }
}
