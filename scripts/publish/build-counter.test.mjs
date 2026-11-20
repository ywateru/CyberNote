import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextVersion} from '../versions.mjs';
import {releaseVersionFromTag} from '../build-info.mjs';

test('fixed 0.2 counter starts at 0001, crosses digit boundaries, and never wraps', () => {
  assert.equal(nextVersion('0.1.0'), '0.2.1');
  assert.equal(nextVersion('0.2.1'), '0.2.2');
  assert.equal(nextVersion('0.2.999'), '0.2.1000');
  assert.equal(nextVersion('0.2.9998'), '0.2.9999');
  for (const version of ['0.2.9999', '0.2.0001', '0.2.0', '0.3.1', '0.2.1-preview.2']) assert.throws(() => nextVersion(version));
  assert.equal(releaseVersionFromTag('v0.2.1','0.2.1'),'0.2.1');
  assert.throws(() => releaseVersionFromTag('v0.2.0001','0.2.1'));
});
