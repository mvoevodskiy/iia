import { maybeSendDigest } from '../../src/monitor/digest.mjs';

const env = { MSB_RUNTIME_ROOT: process.argv[2] };
const api = { sendMessage: async () => {
  process.stdout.write('SENDING\n');
  await new Promise((resolve) => process.stdin.once('data', resolve));
} };
const result = await maybeSendDigest({ api, adminId: 42, env, log() {} });
process.stdout.write(`RESULT:${result.sent ? 'sent' : result.reason}\n`);
process.stdin.destroy();
