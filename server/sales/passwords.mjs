import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { PromotionError } from '../promotion/validation.mjs';

const derive = promisify(scrypt);
const options = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
let running = 0;
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || Buffer.byteLength(password) > 512)
    throw new PromotionError('密码须为 12–128 个字符');
}
async function compute(password, salt) {
  if (running >= 4) throw new PromotionError('登录服务繁忙，请稍后重试', 429);
  running++;
  try { return await derive(password, salt, 64, options); } finally { running--; }
}
export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString('hex');
  return ['scrypt', '16384', '8', '1', salt, (await compute(password, salt)).toString('hex')].join('$');
}
export async function verifyPassword(password, encoded) {
  const parts = String(encoded ?? '').split('$');
  const valid = parts.length === 6 && parts.slice(0, 4).join('$') === 'scrypt$16384$8$1' && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{128}$/.test(parts[5]);
  const acceptable = typeof password === 'string' && password.length <= 128 && Buffer.byteLength(password) <= 512;
  const actual = await compute(acceptable ? password : '', valid ? parts[4] : '0'.repeat(32));
  const expected = Buffer.from(valid ? parts[5] : '0'.repeat(128), 'hex');
  return timingSafeEqual(actual, expected) && valid && acceptable;
}
