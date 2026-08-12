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
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const cookies = req.cookies || parseCookies(req);
    const token = cookies?.wazue_session;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để mua hàng' });
    }

    // 1. Xác thực người dùng từ session
    let username = null;
    try {
      const { tokenHash } = await import('./_auth.js');
      const hash = tokenHash(token);
      const { data: session } = await supabase
        .from('sessions')
        .select('username')
        .eq('token_hash', hash)
        .maybeSingle();

      if (session) username = session.username;
    } catch (authErr) {
      console.error('Lỗi auth buy:', authErr.message);
    }

    if (!username) {
      return res.status(401).json({ success: false, message: 'Phiên đăng nhập hết hạn' });
    }

    const { productId } = req.body || {};
    if (!productId) {
      return res.status(400).json({ success: false, message: 'Thiếu ID sản phẩm' });
    }

    // 2. Lấy thông tin sản phẩm
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle();

    if (!product) {
      return res.status(404).json({ success: false, message: 'Sản phẩm không tồn tại' });
    }

    // 3. Kiểm tra số dư người dùng
    const { data: user } = await supabase
      .from('users')
      .select('balance')
      .ilike('username', username)
      .maybeSingle();

    const currentBalance = Number(user?.balance || 0);
    const price = Number(product.price || 0);

    if (currentBalance < price) {
      return res.status(400).json({ 
        success: false, 
        message: `Số dư không đủ (${currentBalance.toLocaleString('vi-VN')}đ). Cần thêm ${(price - currentBalance).toLocaleString('vi-VN')}đ.` 
      });
    }

    // 4. Trừ tiền tài khoản
    const newBalance = currentBalance - price;
    await supabase
      .from('users')
      .update({ balance: newBalance })
      .ilike('username', username);

    // 5. Tạo đơn hàng và thông tin tài khoản/license giao cho khách
    const orderCode = 'ORD' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const deliveredAccount = product.stock_content || product.account_data || 'Cảm ơn bạn đã mua hàng! Liên hệ Admin để nhận tài khoản.';

    await supabase.from('orders').insert([{
      username: username.toLowerCase(),
      order_code: orderCode,
      product_id: product.id,
      product_name: product.name,
      amount: price,
      status: 'COMPLETED',
      account: deliveredAccount
    }]);

    // 6. Ghi log giao dịch ví
    try {
      await supabase.from('wallet_transactions').insert([{
        username: username.toLowerCase(),
        type: 'BUY',
        amount: -price,
        reference: orderCode,
        status: 'COMPLETED'
      }]);
    } catch (e) {}

    return res.status(200).json({
      success: true,
      message: 'Mua hàng thành công!',
      account: deliveredAccount,
      orderCode: orderCode
    });

  } catch (error) {
    console.error('Lỗi mua hàng:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
