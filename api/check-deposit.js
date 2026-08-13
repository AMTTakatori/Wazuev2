import { createClient } from '@supabase/supabase-js';
import { createNetlifyHandler } from './_adapter.js';

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

async function checkDepositHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // Xác thực người dùng
    const cookies = req.cookies || parseCookies(req);
    const token = cookies?.wazue_session;
    let username = null;
    if (token) {
      try {
        const { tokenHash } = await import('./_auth.js');
        const hash = tokenHash(token);
        const { data: session } = await supabase
          .from('sessions')
          .select('username')
          .eq('token_hash', hash)
          .maybeSingle();
        if (session) username = session.username;
      } catch (e) {}
    }

    const code = req.query?.transCode || req.query?.trans_code || req.query?.code;

    // Chế độ 1: Kiểm tra 1 mã nạp cụ thể (dành cho tự động check khi hiện QR)
    if (code && code !== 'undefined' && code !== 'null') {
      const { data: deposit } = await supabase
        .from('deposits')
        .select('*')
        .eq('trans_code', code)
        .maybeSingle();

      if (!deposit) {
        return res.status(200).json({ success: false, message: 'Chưa tìm thấy đơn' });
      }

      return res.status(200).json({
        success: true,
        deposit: {
          id: deposit.id,
          username: deposit.username,
          transCode: deposit.trans_code,
          trans_code: deposit.trans_code,
          amount: Number(deposit.amount || 0),
          status: deposit.status,
          created_at: deposit.created_at
        }
      });
    }

    // Chế độ 2: Trả về toàn bộ danh sách lịch sử nạp của user
    if (!username) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }

    const { data: deposits, error } = await supabase
      .from('deposits')
      .select('*')
      .ilike('username', username)
      .order('id', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      deposits: deposits || []
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export default checkDepositHandler;
export const handler = createNetlifyHandler(checkDepositHandler);
