import { createClient } from '@supabase/supabase-js';

function parseCookies(req) {
  const list = {};
  const rc = req.headers?.cookie;
  if (rc) {
    rc.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ authenticated: false, message: 'Method Not Allowed' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const cookies = req.cookies || parseCookies(req);
    const token = cookies?.wazue_session;

    if (!token) {
      return res.status(401).json({ authenticated: false, message: 'Chưa đăng nhập' });
    }

    let username = null;
    try {
      const { tokenHash } = await import('./_auth.js');
      const hash = tokenHash(token);
      const { data: session } = await supabase
        .from('sessions')
        .select('username, expires_at')
        .eq('token_hash', hash)
        .maybeSingle();

      if (session) {
        if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
          await supabase.from('sessions').delete().eq('token_hash', hash);
          return res.status(401).json({ authenticated: false, message: 'Session đã hết hạn' });
        }
        username = session.username;
      }
    } catch (authErr) {
      console.error('Lỗi auth me:', authErr.message);
    }

    if (!username) {
      return res.status(401).json({ authenticated: false, message: 'Session không hợp lệ' });
    }

    // 1. Truy vấn User bằng .eq() trước, dùng .limit(1) để chống crash khi trùng lặp
    let { data: users } = await supabase
      .from('users')
      .select('id, username, balance, created_at')
      .eq('username', username)
      .limit(1);

    // Nếu .eq() không thấy, thử tìm bằng .ilike() kèm .limit(1)
    if (!users || users.length === 0) {
      const ilikeRes = await supabase
        .from('users')
        .select('id, username, balance, created_at')
        .ilike('username', username)
        .limit(1);
      users = ilikeRes.data;
    }

    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      return res.status(404).json({
        authenticated: false,
        message: 'Không tìm thấy tài khoản'
      });
    }

    // 2. Lấy dữ liệu các bảng theo chuẩn tên username trong DB
    const dbUsername = user.username;

    const [dRes, oRes, tRes] = await Promise.all([
      supabase.from('deposits').select('*').ilike('username', dbUsername).order('created_at', { ascending: false }).limit(50),
      supabase.from('orders').select('*').ilike('username', dbUsername).order('created_at', { ascending: false }).limit(50),
      supabase.from('wallet_transactions').select('*').ilike('username', dbUsername).order('created_at', { ascending: false }).limit(50)
    ]);

    return res.status(200).json({
      authenticated: true,
      success: true,
      user: {
        id: user.id,
        username: user.username,
        balance: Number(user.balance || 0),
        created_at: user.created_at
      },
      deposits: dRes.data || [],
      orders: oRes.data || [],
      transactions: tRes.data || []
    });

  } catch (error) {
    console.error('Lỗi /api/me:', error);
    return res.status(500).json({ authenticated: false, message: error.message });
  }
}
