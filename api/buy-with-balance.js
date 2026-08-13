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

function generateRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function parseProductDays(productName) {
  if (!productName) return 30;
  const match = productName.match(/(\d+)\s*(ngày|day)/i);
  return (match && match[1]) ? parseInt(match[1]) : 30;
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

    // 1. Xác thực người dùng
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

    // 4. PHÂN NHÁNH BÀN GIAO SẢN PHẨM
    let deliveredAccount = (product.stock_content && product.stock_content.trim() !== '') 
      ? product.stock_content.trim() 
      : '';

    // NẾU CHƯA CÓ KHO SẴN -> MỚI GỌI API QLING (Tạo nick Wazue tự động)
    if (!deliveredAccount) {
      const apiBase = (process.env.QLING_BASE_URL || 'http://qling.ddns.net').replace(/\/$/, '');
      const ctvKey = process.env.QLING_CTV_KEY;
      const rawPrefix = (process.env.QLING_PREFIX || 'ctv').replace(/-$/, '');

      if (!ctvKey) {
        return res.status(500).json({
          success: false,
          message: 'Lỗi cấu hình: Chưa thiết lập QLING_CTV_KEY trên Vercel'
        });
      }

      const newUsername = `${rawPrefix}-${generateRandomString(6)}`;
      const newPassword = generateRandomString(8);

      // Gọi API Qling tạo tài khoản
      const createRes = await fetch(`${apiBase}/api/ctv/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ctv-Key': ctvKey
        },
        body: JSON.stringify({ username: newUsername, password: newPassword })
      });

      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        return res.status(500).json({
          success: false,
          message: 'Lỗi tạo tài khoản Qling: ' + (createData.message || 'Server không phản hồi')
        });
      }

      // Kích hoạt Plan & Ngày dùng
      const daysToExtend = parseProductDays(product.name);
      const planToSet = product.plan !== undefined ? parseInt(product.plan) : 1;

      await fetch(`${apiBase}/api/ctv/users/${encodeURIComponent(newUsername)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Ctv-Key': ctvKey
        },
        body: JSON.stringify({ plan: planToSet, extend_days: daysToExtend })
      });

      deliveredAccount = `TK: ${newUsername} | MK: ${newPassword} | Hạn: ${daysToExtend} Ngày`;
    }

    // 5. Trừ tiền tài khoản người mua
    const newBalance = currentBalance - price;
    await supabase
      .from('users')
      .update({ balance: newBalance })
      .ilike('username', username);

    const orderCode = 'ORD' + Math.random().toString(36).substring(2, 8).toUpperCase();

    // 6. Lưu đơn hàng
    await supabase.from('orders').insert([{
      username: username.toLowerCase(),
      order_code: orderCode,
      product_id: product.id,
      product_name: product.name,
      amount: price,
      status: 'COMPLETED',
      account: deliveredAccount
    }]);

    // 7. Ghi lịch sử ví
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
