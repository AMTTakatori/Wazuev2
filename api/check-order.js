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

async function checkOrderHandler(req, res) {
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

    const code = req.query?.orderCode || req.query?.order_code || req.query?.code;

    // Chế độ 1: Kiểm tra 1 mã đơn hàng cụ thể
    if (code && code !== 'undefined' && code !== 'null') {
      const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('order_code', code)
        .maybeSingle();

      if (!order) {
        return res.status(200).json({ success: false, message: 'Không tìm thấy đơn hàng' });
      }

      return res.status(200).json({ success: true, order });
    }

    // Chế độ 2: Trả về toàn bộ lịch sử mua hàng của user
    if (!username) {
      return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .ilike('username', username)
      .order('id', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(200).json({
      success: true,
      orders: orders || []
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}

export default checkOrderHandler;
export const handler = createNetlifyHandler(checkOrderHandler);
