import { db, tokenHash } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      authenticated: false,
      message: 'Method Not Allowed'
    });
  }

  try {
    const supabase = db();

    // Cookie được tạo bởi auth.js
    const token = req.cookies?.wazue_session;

    if (!token) {
      return res.status(401).json({
        authenticated: false,
        message: 'Chưa đăng nhập'
      });
    }

    // auth.js lưu token_hash nên /me cũng phải hash token trước khi tìm
    const hash = tokenHash(token);

    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('username, expires_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (sessionErr) {
      console.error('Session error:', sessionErr);

      return res.status(500).json({
        authenticated: false,
        message: 'Không thể kiểm tra session'
      });
    }

    if (!session) {
      return res.status(401).json({
        authenticated: false,
        message: 'Session không hợp lệ hoặc đã hết hạn'
      });
    }

    // Kiểm tra hạn session
    if (
      session.expires_at &&
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      await supabase
        .from('sessions')
        .delete()
        .eq('token_hash', hash);

      return res.status(401).json({
        authenticated: false,
        message: 'Session đã hết hạn'
      });
    }

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, username, balance, created_at')
      .eq('username', session.username)
      .maybeSingle();

    if (userErr) {
      console.error('User error:', userErr);

      return res.status(500).json({
        authenticated: false,
        message: 'Không thể lấy thông tin tài khoản'
      });
    }

    if (!user) {
      return res.status(404).json({
        authenticated: false,
        message: 'Không tìm thấy người dùng'
      });
    }

    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        balance: Number(user.balance || 0),
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error('Lỗi /api/me:', error);

    return res.status(500).json({
      authenticated: false,
      message: 'Lỗi máy chủ.'
    });
  }
}
