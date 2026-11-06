import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { initDataSignatureOk, parseInitDataFields, verifyTgWebAppInitData } from '../../src/server/tg-webapp.ts';

/** Собрать initData с верной подписью для тестов. */
function signInitData(botToken: string, fields: Record<string, string>): string {
  const params = new URLSearchParams(fields);
  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

const BOT = '5768337691:AAH5YkoiEuPk8-FZa32hStHTqXiLPtAEhx8';
const OWNER = '279058397';

test('подпись initData: вектор из документации Telegram Mini Apps', () => {
  // https://docs.telegram-mini-apps.com/platform/init-data — известный hash.
  const initData = [
    'auth_date=1662771648',
    'query_id=AAHdF6IQAAAAAN0XohDhrOrc',
    'user={"id":279058397,"first_name":"Vladislav","last_name":"Kibenko","username":"vdkfrost","language_code":"ru","is_premium":true}',
    'hash=c501b71e775f74ce10e377dea85a7ea24ecd640b223ea86dfe453e0eaed2e2b2',
  ].join('&');
  assert.equal(initDataSignatureOk(initData, BOT), true);
  assert.equal(initDataSignatureOk(initData, '1:wrong'), false);
});

test('verifyTgWebAppInitData: владелец проходит, чужой и протухшее — нет', () => {
  const authDate = 1_700_000_000;
  const initData = signInitData(BOT, {
    auth_date: String(authDate),
    user: JSON.stringify({ id: Number(OWNER), first_name: 'Михаил', username: 'owner' }),
  });
  const ok = verifyTgWebAppInitData(initData, BOT, OWNER, authDate + 60);
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.data.user.id, 279058397);
    assert.equal(ok.data.user.username, 'owner');
  }

  const stranger = signInitData(BOT, {
    auth_date: String(authDate),
    user: JSON.stringify({ id: 1, first_name: 'X' }),
  });
  assert.equal(verifyTgWebAppInitData(stranger, BOT, OWNER, authDate + 60).ok, false);

  const stale = verifyTgWebAppInitData(initData, BOT, OWNER, authDate + 25 * 60 * 60);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.match(stale.error, /устарел/);
});

test('parseInitDataFields: пары через &, значение user с JSON', () => {
  const raw = [
    'query_id=AAHdF6IQAAAAAN0XohDhrOrc',
    'user={"id":279058397,"first_name":"Vladislav"}',
    'auth_date=1662771648',
    'hash=c501b71e775f74ce10e377dea85a7ea24ecd640b223ea86dfe453e0eaed2e2b2',
  ].join('&');
  const m = parseInitDataFields(raw);
  assert.equal(m.get('query_id'), 'AAHdF6IQAAAAAN0XohDhrOrc');
  assert.equal(m.get('user'), '{"id":279058397,"first_name":"Vladislav"}');
  assert.equal(m.get('auth_date'), '1662771648');
});

test('hash WebView: незакодированный tgWebAppData нельзя резать по первому &', () => {
  // Telegram иногда кладёт поля initData в hash без обёртки encode — тогда split('&')/URLSearchParams портят value.
  const initData = [
    'auth_date=1662771648',
    'query_id=AAHdF6IQAAAAAN0XohDhrOrc',
    'user={"id":279058397,"first_name":"Vladislav","last_name":"Kibenko","username":"vdkfrost","language_code":"ru","is_premium":true}',
    'hash=c501b71e775f74ce10e377dea85a7ea24ecd640b223ea86dfe453e0eaed2e2b2',
  ].join('&');
  const hash = `tgWebAppData=${initData}&tgWebAppVersion=8.0&tgWebAppPlatform=android`;

  const broken = new URLSearchParams(hash).get('tgWebAppData') ?? '';
  assert.equal(broken, 'auth_date=1662771648');
  assert.equal(initDataSignatureOk(broken, BOT), false);

  // Верный: взять до &tgWebAppVersion=.
  const key = 'tgWebAppData=';
  const start = hash.indexOf(key);
  let value = hash.slice(start + key.length);
  const stop = value.search(/&tgWebApp(?:Version|Platform|ThemeParams)=/);
  if (stop >= 0) value = value.slice(0, stop);
  assert.equal(value, initData);
  assert.equal(initDataSignatureOk(value, BOT), true);
});

test('verify: повторно URL-кодированный initData тоже принимается', () => {
  const authDate = 1_700_000_000;
  const initData = signInitData(BOT, {
    auth_date: String(authDate),
    user: JSON.stringify({ id: Number(OWNER), first_name: 'Mikhail' }),
  });
  const wrapped = encodeURIComponent(initData);
  const ok = verifyTgWebAppInitData(wrapped, BOT, OWNER, authDate + 60);
  assert.equal(ok.ok, true);
});
