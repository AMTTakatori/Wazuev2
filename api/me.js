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
          return res.status(401).json({ authenticated: false, message: 'Session hết hạn' });
        }
        username = session.username;
      }
    } catch (authErr) {
      console.warn('Lỗi auth me:', authErr.message);
    }

    if (!username) {
      return res.status(401).json({ authenticated: false, message: 'Session không hợp lệ' });
    }

    // Lấy dữ liệu không phân biệt hoa thường (.ilike)
    const [uRes, dRes, oRes, tRes] = await Promise.all([
      supabase.from('users').select('id, username, balance, created_at').ilike('username', username).maybeSingle(),
      supabase.from('deposits').select('*').ilike('username', username).order('created_at', { ascending: false }).limit(50),
      supabase.from('orders').select('*').ilike('username', username).order('created_at', { ascending: false }).limit(50),
      supabase.from('wallet_transactions').select('*').ilike('username', username).order('created_at', { ascending: false }).limit(50)
    ]);

    if (!uRes.data) {
      return res.status(404).json({ authenticated: false, message: 'Không tìm thấy tài khoản' });
    }

    return res.status(200).json({
      authenticated: true,
      success: true,
      user: {
        id: uRes.data.id,
        username: uRes.data.username,
        balance: Number(uRes.data.balance || 0),
        created_at: uRes.data.created_at
      },
      deposits: dRes.data || [],
      orders: oRes.data || [],
      transactions: tRes.data || []
    });

  } catch (error) {
    return res.status(500).json({ authenticated: false, message: error.message });
  }
}
