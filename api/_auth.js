import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export function db() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_KEY');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

export function cookieOptions(maxAge) {
  return `wazue_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

export function newToken() { return crypto.randomBytes(32).toString('hex'); }
export function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hashHex] = String(stored).split(':');
    if (!salt || !hashHex) return false;
    const actual = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hashHex, 'hex');
    return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function getCookie(req, name) {
  const raw = req.headers?.cookie || '';
  const found = raw.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

export async function requireUser(req) {
  const token = getCookie(req, 'wazue_session');
  if (!token) return null;
  const supabase = db();
  const { data, error } = await supabase
    .from('sessions')
    .select('username, expires_at')
    .eq('token_hash', tokenHash(token))
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase.from('sessions').delete().eq('token_hash', tokenHash(token));
    return null;
  }
  return { username: data.username, tokenHash: tokenHash(token) };
}
