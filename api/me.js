import { db, tokenHash } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Cookie');

  if (req.method !== 'GET') {
    return res.status(405).json({ authenticated: false, message: 'Method Not Allowed' });
  }

  try {
    const supabase = db();
    const token = req.cookies?.wazue_session;

    if (!token) {
      return res.status(401).json({ authenticated: false, message: 'Chưa đăng nhập' });
    }

    const hash = tokenHash(token);

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('username, expires_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (sessionError) {
      console.error('Session error:', sessionError);
      return res.status(500).json({ authenticated: false, message: 'Lỗi kiểm tra session' });
    }

    if (!session) {
      return res.status(401).json({ authenticated: false, message: 'Session không hợp lệ hoặc đã hết hạn' });
    }

    if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
      await supabase.from('sessions').delete().eq('token_hash', hash);
      return res.status(401).json({ authenticated: false, message: 'Session đã hết hạn' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('username, balance, created_at')
      .eq('username', session.username)
      .maybeSingle();

    if (userError) {
      console.error('User error:', userError);
      return res.status(500).json({ authenticated: false, message: 'Lỗi lấy thông tin tài khoản' });
    }

    if (!user) {
      return res.status(404).json({ authenticated: false, message: 'Không tìm thấy người dùng' });
    }

    return res.status(200).json({
      authenticated: true,
      user: {
        username: user.username,
        balance: Number(user.balance || 0),
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Lỗi /api/me:', error);
    return res.status(500).json({ authenticated: false, message: 'Lỗi máy chủ.' });
  }
}
