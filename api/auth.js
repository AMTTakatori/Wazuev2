import { db, hashPassword, verifyPassword, newToken, tokenHash } from './_auth.js';

const USER_RE = /^[A-Za-z0-9_]{3,24}$/;
const MAX_AGE = 60 * 60 * 24 * 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success:false, message:'Method Not Allowed' });
  try {
    const { action, username, password } = req.body || {};
    const name = String(username || '').trim();
    const pass = String(password || '');
    if (!USER_RE.test(name)) return res.status(400).json({ success:false, message:'Username 3-24 ký tự, chỉ gồm chữ, số và _.' });
    if (pass.length < 6 || pass.length > 128) return res.status(400).json({ success:false, message:'Mật khẩu phải từ 6-128 ký tự.' });
    const supabase = db();

    if (action === 'register') {
      const { data: exists, error: findErr } = await supabase.from('users').select('username').eq('username', name).maybeSingle();
      if (findErr) throw findErr;
      if (exists) return res.status(409).json({ success:false, message:'Tên tài khoản đã tồn tại.' });
      const { error } = await supabase.from('users').insert({ username:name, password_hash:hashPassword(pass), balance:0 });
      if (error) throw error;
      return res.status(201).json({ success:true, message:'Đăng ký thành công.' });
    }

    if (action === 'login') {
      const { data:user, error } = await supabase.from('users').select('username,password_hash,balance').eq('username', name).maybeSingle();
      if (error) throw error;
      if (!user || !verifyPassword(pass, user.password_hash)) return res.status(401).json({ success:false, message:'Sai tài khoản hoặc mật khẩu.' });
      const token = newToken();
      const expires = new Date(Date.now() + MAX_AGE*1000).toISOString();
      await supabase.from('sessions').delete().eq('username', name).lt('expires_at', new Date().toISOString());
      const { error: sessionErr } = await supabase.from('sessions').insert({ username:name, token_hash:tokenHash(token), expires_at:expires });
      if (sessionErr) throw sessionErr;
      res.setHeader('Set-Cookie', `wazue_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${MAX_AGE}`);
      return res.status(200).json({ success:true, user:{ username:name, balance:Number(user.balance||0) } });
    }
    return res.status(400).json({ success:false, message:'Action không hợp lệ.' });
  } catch (e) { console.error(e); return res.status(500).json({ success:false, message:'Lỗi máy chủ.' }); }
}
