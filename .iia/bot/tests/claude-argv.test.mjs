import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStreamLineForTest, buildArgsForTest } from '../src/agent/claude-testables.mjs';

test('stream-json parse', () => {
  assert.equal(parseStreamLineForTest(''), null);
  assert.deepEqual(parseStreamLineForTest('{"type":"system","subtype":"init"}'), {
    type: 'system',
    subtype: 'init',
  });
  assert.equal(parseStreamLineForTest('{not json'), null);
});

test('argv shape', () => {
  const args = buildArgsForTest({
    model: 'claude-opus-4-6',
    sessionId: 'abc',
    permissionMode: 'bypassPermissions',
    effort: 'high',
    systemPrompt: 'hi',
  });
  assert.equal(args[0], '-p');
  assert.ok(args.includes('stream-json'));
  assert.ok(args.includes('--resume'));
  assert.ok(args.includes('abc'));
  assert.ok(args.includes('--model'));
  assert.ok(args.includes('--effort'));
  assert.ok(args.includes('--append-system-prompt'));
});
