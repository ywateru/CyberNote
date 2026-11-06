#!/usr/bin/env node
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { openRuntime, api, idle, snapshot, state, saveJSON, waitForIdle } from './runtime.mjs';
import { compareSnapshots, compareScreenshots } from './compare.mjs';
import { runGroups, groupNames } from './scenarios.mjs';
import {sourceFingerprint} from './source-identity.mjs';

const usage = `Notes debug v1 (isolated synthetic data, no installed app is opened)
  pnpm debug list
  pnpm debug execute <catalog-id> '{"argument":"value"}'
  pnpm debug script /absolute/steps.json
  pnpm debug snapshot --selector '.app' --out /tmp/notes-result
  pnpm debug group <${groupNames.join('|')}>
  pnpm debug all
  pnpm debug group attachments --mobile
  pnpm debug group quick-home --mobile
  pnpm debug check-production --production dist
  pnpm debug compare baseline.json current.json
  pnpm debug compare-shot baseline.png current.png
Flags: --out DIR --keep --mobile --transport EXISTING_BINARY --timeout MS.
No Rust compilation or package launch is performed. --transport is opt-in and never falls back on failure.
Steps: [{"command":"note.create","args":{}},{"command":"editor.insertText","args":{"text":"Hello"}},{"command":"app.flush"}].
Special script steps: {"platform":{"advanceMs":1000,"mediaFail":{"decode":1},"fail":{"save":2},"delay":{"save":250}}}, {"snapshot":{"selector":".app"}}, {"screenshot":"result.png"}, {"waitForIdle":{"timeoutMs":1000}}.
CLI invocations create independent workspaces; use one steps script to keep state across commands.`;

function parse(argv) {
  const options = { timeout: 15000 }, positional = [];
  const valued = new Set(['out', 'selector', 'transport', 'timeout', 'production', 'chrome', 'playwright', 'tmp']);
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i]; if (!value.startsWith('--')) { positional.push(value); continue; }
    const flag = value.slice(2); if (['keep', 'mobile'].includes(flag)) options[flag] = true;
    else if (valued.has(flag)) { if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw Error('Missing --' + flag + ' value'); options[flag] = argv[++i]; }
    else throw Error('Unknown flag --' + flag);
  }
  options.timeout = Number(options.timeout); if (!Number.isInteger(options.timeout) || options.timeout < 50 || options.timeout > 60000) throw Error('--timeout must be an integer 50..60000');
  return { options, positional };
}
const bounded = (value, limit = 64000) => { const json = JSON.stringify(value, null, 2); return json.length <= limit ? json : JSON.stringify({ error: 'OUTPUT_LIMIT', chars: json.length, maxChars: limit, hint: 'Use --out to write full bounded artifacts and inspect targeted snapshots.' }); };
async function productionMarkers(directory) {
  const markers = ['__NOTES_DEBUG__', 'SyntheticMediaRecorder', '__DEBUG_PLATFORM__', 'synthetic-device-and-ipc-boundaries']; const matches = []; let files = 0;
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) if (entry.isFile() && /\.(js|html|json)$/.test(entry.name)) { files++; const file = resolve(entry.parentPath, entry.name), text = await readFile(file, 'utf8'); for (const marker of markers) if (text.includes(marker)) matches.push({ file: file.slice(directory.length + 1), marker }); }
  if (matches.length) throw Error('Production bundle contains debug/mock markers: ' + JSON.stringify(matches)); return { files, markers, matches };
}
async function completion(page, command, timeout) {
  if (!['app.close', 'app.quit'].includes(command)) return idle(page, timeout);
  await page.waitForFunction((command) => command === 'app.close' ? window.__DEBUG_PLATFORM__?.destroyed : window.__DEBUG_PLATFORM__?.quitAcknowledgements.some((ack) => ack.success), command, { timeout });
  return { simulatedTerminal: command === 'app.close' ? 'window-destroyed' : 'quit-acknowledged', osTerminationTested: false };
}
let runtime, failed = false, sourceInputsAtStart; const started = performance.now(); let options = {};
try {
  const parsed = parse(process.argv.slice(2)); options = parsed.options; const [mode = 'help', ...args] = parsed.positional;
  if (mode === 'help') { console.log(usage); process.exitCode = 0; }
  else if (mode === 'compare') { if (args.length !== 2) throw Error('compare needs two snapshot paths'); console.log(bounded(compareSnapshots(JSON.parse(await readFile(args[0], 'utf8')), JSON.parse(await readFile(args[1], 'utf8'))))); }
  else {
    const allowed = ['list', 'execute', 'script', 'snapshot', 'group', 'all', 'check-production', 'compare-shot']; if (!allowed.includes(mode)) throw Error('Unknown CLI mode ' + mode);
    if (options.mobile && (mode === 'all' || mode === 'group' && !['notes', 'recording', 'attachments', 'data-management', 'image-preview', 'storage-overview', 'preferences', 'quick-home', 'sync-settings'].includes(args[0]))) throw Object.assign(Error('Automated mobile browser coverage is groups notes, recording, attachments, data-management, image-preview, storage-overview, preferences and quick-home only. The complete suite is desktop-scoped; execute/script/snapshot remain available with --mobile.'), { code: 'UNSUPPORTED' });
    if (mode === 'check-production' && !options.production) throw Error('check-production requires --production pointing to a normal frontend build');
    sourceInputsAtStart = await sourceFingerprint(process.cwd()); runtime = await openRuntime(options); const page = runtime.page; const output = options.out ? resolve(options.out) : runtime.directory; await mkdir(output, { recursive: true });
    let result;
    if (mode === 'list') result = { version: 1, commands: await page.evaluate(() => window.__NOTES_DEBUG__.list()) };
    else if (mode === 'execute') { if (!args[0] || args.length > 2) throw Error('execute needs command and optional JSON object'); const input = args[1] ? JSON.parse(args[1]) : {}; result = await api(page, args[0], input); result.completion = await completion(page, args[0], options.timeout); }
    else if (mode === 'script') {
      if (args.length !== 1) throw Error('script needs one JSON path'); const bytes = await readFile(args[0]); if (bytes.length > 65536) throw Error('Steps file exceeds 64KiB'); const steps = JSON.parse(bytes.toString()); if (!Array.isArray(steps) || steps.length > 100) throw Error('Steps must be an array of at most 100 steps'); const results = []; let terminal;
      for (const [index, step] of steps.entries()) {
        if (!step || typeof step !== 'object' || Array.isArray(step)) throw Error('Invalid step ' + index);
        const keys = Object.keys(step); if (keys.some((key) => !['command', 'args', 'platform', 'snapshot', 'screenshot', 'waitForIdle'].includes(key))) throw Error('Unknown step field at ' + index);
        if (keys.filter((key) => ['command', 'platform', 'snapshot', 'screenshot', 'waitForIdle'].includes(key)).length !== 1 || ('args' in step && !('command' in step))) throw Error('Step must specify exactly one operation at ' + index);
        let value;
        if (step.command) { value = await api(page, step.command, Object.prototype.hasOwnProperty.call(step, 'args') ? step.args : {}); if (['app.close', 'app.quit'].includes(step.command)) terminal = value.completion = await completion(page, step.command, options.timeout); else await idle(page, options.timeout); }
        else if (step.platform) { const { advanceMs, ...config } = step.platform; value = await page.evaluate(async ({ advanceMs, config }) => { await window.__DEBUG_PLATFORM__.configure(config); if (advanceMs !== undefined) window.__DEBUG_PLATFORM__.advance(advanceMs); return { simulated: true }; }, { advanceMs, config }); }
        else if (step.snapshot) { const target = resolve(output, 'step-' + index + '.snapshot.json'); await saveJSON(target, await snapshot(page, step.snapshot)); value = { snapshot: target }; }
        else if (step.screenshot) { const target = resolve(output, step.screenshot); if (!target.startsWith(output + '/')) throw Error('Screenshot must stay inside output directory'); await page.screenshot({ path: target }); value = { screenshot: target }; }
        else if (Object.prototype.hasOwnProperty.call(step, 'waitForIdle')) value = await waitForIdle(page, step.waitForIdle);
        else throw Error('Step must specify one operation');
        results.push({ index, ...(step.command ? { command: step.command } : {}), result: value });
      }
      if (!terminal) await idle(page, options.timeout); result = { steps: results, ...(terminal ? { completion: terminal } : {}), state: await state(page) };
    } else if (mode === 'snapshot') { const snap = await snapshot(page, { selector: options.selector || '.app' }); await saveJSON(resolve(output, 'snapshot.json'), snap); await page.screenshot({ path: resolve(output, 'screenshot.png') }); result = { snapshot: resolve(output, 'snapshot.json'), screenshot: resolve(output, 'screenshot.png') }; }
    else if (mode === 'all' || mode === 'group') { const names = mode === 'all' ? groupNames : [args[0]]; if (names.some((name) => !groupNames.includes(name) && !(options.mobile && ['attachments','quick-home'].includes(name)))) throw Error('Unknown scenario group'); result = await runGroups(runtime, names, output); }
    else if (mode === 'compare-shot') { if (args.length !== 2) throw Error('compare-shot needs two PNG paths'); result = await compareScreenshots(page, args[0], args[1]); }
    else if (mode === 'check-production') { const bundle = await productionMarkers(resolve(runtime.root, options.production)); const absent = await page.evaluate(() => !('__NOTES_DEBUG__' in window)); if (!absent) throw Error('Production debug API is present'); await page.goto(runtime.origin + '/?notesDebug=1&VITE_NOTES_DEBUG=1'); await page.waitForSelector('.app'); if (!await page.evaluate(() => !('__NOTES_DEBUG__' in window))) throw Error('Production URL restored debug API'); result = { productionAPIAbsent: true, urlCannotEnable: true, bundle, platformMockInjectedByRunnerOnly: true }; }
    const sourceInputs = await sourceFingerprint(runtime.root); const summary = { version: 1, mode, sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: runtime.root, encoding: 'utf8' }).trim(), sourceInputs, sourceInputsAtStart, sourceInputsChanged: sourceInputs.sha256 !== sourceInputsAtStart.sha256, ...runtime.metadata, elapsedMs: Math.round(performance.now() - started), result, pageErrors: runtime.errors };
    if (options.out || options.keep) { await saveJSON(resolve(output, 'summary.json'), summary); summary.output = output; }
    console.log(bounded(summary));
    if (runtime.errors.length) throw Error('Application page errors: ' + runtime.errors.join('; '));
  }
} catch (error) {
  failed = true; process.exitCode = 1;
  if (runtime) { try { const output = options.out ? resolve(options.out) : runtime.directory; await saveJSON(resolve(output, 'failure.snapshot.json'), await snapshot(runtime.page, { selector: '.app', maxChars: 16000, maxNodes: 100 })); await runtime.page.screenshot({ path: resolve(output, 'failure.png') }); await saveJSON(resolve(output, 'failure.json'), { message: error.message, stack: error.stack, metadata: runtime.metadata, sourceInputsAtStart, sourceInputs: await sourceFingerprint(runtime.root), ...(runtime.backend.workspace ? { workspaceCounts: { notes: runtime.backend.workspace.notes.length, folders: runtime.backend.workspace.folders.length, attachments: runtime.backend.workspace.attachments.length } } : {}), elapsedMs: Math.round(performance.now() - started), pageErrors: runtime.errors }); } catch {} }
  console.error(bounded({ error: error.code || 'CLI_ERROR', message: error.message, retainedOutput: runtime ? (options.out ? resolve(options.out) : runtime.directory) : undefined }));
} finally { await runtime?.cleanup({ keep: !!options.keep || failed && !options.out }); }
