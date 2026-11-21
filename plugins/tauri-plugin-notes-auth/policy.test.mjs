// Device-free checks of the exact rule JSON passed to WKContentRuleListStore.
// These do not compile Objective-C or prove WebKit runtime enforcement.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('./macos/login.m', import.meta.url), 'utf8');
const literal = source.match(/NSString \*rules = @("(?:[^"\\]|\\.)*");/);
assert.ok(literal, 'one fixed native rule list');
const rules = JSON.parse(JSON.parse(literal[1]));
function blocked(url) {
  let result = false;
  for (const rule of rules) {
    if (new RegExp(rule.trigger['url-filter']).test(url)) {
      if (rule.action.type === 'block') result = true;
      else if (rule.action.type === 'ignore-previous-rules') result = false;
      else assert.fail('unexpected action');
    }
  }
  return result;
}
test('fixed hosted HTTPS origin permits its authorization, login and static assets', () => {
  for (const path of ['/oidc/auth?state=fixture', '/sign-in', '/register', '/assets/login.js']) {
    assert.equal(blocked(`https://auth.x.aixgg.com${path}`), false);
    assert.equal(blocked(`https://auth.x.aixgg.com:443${path}`), false);
  }
});
test('encoded rules reject foreign and local URL fixtures; no runtime firewall claim', () => {
  for (const url of [
    'https://auth.x.aixgg.com.evil/sign-in', 'https://evil.test/auth.x.aixgg.com/',
    'https://auth.x.aixgg.com:444/sign-in', 'http://auth.x.aixgg.com/sign-in',
    'https://user@auth.x.aixgg.com/sign-in', 'file:///private/tmp/fixture',
    'tauri://localhost/index.html', 'asset://localhost/attachment', 'ipc://localhost/',
    'http://asset.localhost/attachment', 'http://tauri.localhost/', 'data:text/html,fixture',
    'javascript:void(0)', 'intent://fixture', 'content://fixture',
  ]) assert.equal(blocked(url), true, 'foreign or local resource');
});
test('loopback exception requires the fixed port and exact callback path plus query', () => {
  assert.equal(blocked('http://127.0.0.1:17897/callback?code=fixture&state=fixture'), false);
  for (const url of [
    'http://127.0.0.1:17897/', 'http://127.0.0.1:17897/callback',
    'http://127.0.0.1:17897/callback/extra?code=fixture',
    'http://127.0.0.1:17897/callback.evil?code=fixture',
    'http://127.0.0.1:17898/callback?code=fixture', 'http://localhost:17897/callback?code=fixture',
  ]) assert.equal(blocked(url), true, 'not the exact callback shape');
});
test('cloud wildcard rules escape hosts through Foundation before JSON serialization', () => {
  const block = source.match(/static NSString \*cloudRules\([\s\S]*?\n\}/)?.[0];
  assert.ok(block, 'cloudRules present');
  assert.match(block, /escapedPatternForString/);
  assert.ok(
    !block.includes('stringByReplacingOccurrencesOfString'),
    'manual regex escaping silently doubles the backslash in JSON',
  );
});
