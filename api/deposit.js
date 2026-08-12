import { createClient } from '@supabase/supabase-js';

// Hàm hỗ trợ đọc Cookie trực tiếp từ Request Header
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
    
    // 1. Xác thực người dùng qua Cookie phiên làm việc
    const cookies = req.cookies || parseCookies(req);
    const token = cookies?.wazue_session;
    let username = req.body?.username;

    if (token && !username) {
      try {
        const { tokenHash } = await import('./_auth.js');
        const hash = tokenHash(token);
        const { data: session } = await supabase
          .from('sessions')
          .select('username')
          .eq('token_hash', hash)
          .maybeSingle();
        if (session?.username) username = session.username;
      } catch (authErr) {
        console.warn('Lỗi đọc auth module:', authErr.message);
      }
    }

    if (!username) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập để thực hiện nạp tiền.'
      });
    }

    // 2. Kiểm tra số tiền nạp hợp lệ
    const amount = Number(req.body?.amount || 0);
    if (!amount || amount < 7000) {
      return res.status(400).json({
        success: false,
        message: 'Số tiền nạp tối thiểu là 7.000đ.'
      });
    }

    // 3. Tạo mã giao dịch độc bản (Mẫu: WZ + CleanUser + RandomString)
    const cleanUser = username.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    const transCode = `WZ${cleanUser}${randomPart}`;

    // 4. Lưu đơn nạp vào cơ sở dữ liệu Supabase
    const { error: dbErr } = await supabase.from('deposits').insert([
      {
        username: username,
        trans_code: transCode,
        amount: amount,
        status: 'PENDING'
      }
    ]);

    if (dbErr) {
      console.error('Lỗi lưu đơn nạp Supabase:', dbErr);
      return res.status(500).json({ success: false, message: 'Không thể khởi tạo đơn nạp trong DB.' });
    }

    // 5. Tạo link VietQR / SePay
    const bankId = process.env.BANK_ID || 'MB';
    const bankAcc = process.env.BANK_ACC || '9006688668';
    const qrUrl = `https://qr.sepay.vn/img?bank=${bankId}&acc=${bankAcc}&template=compact&amount=${amount}&des=${transCode}`;

    // 6. Trả về Response đồng bộ tất cả tên biến (chống lỗi undefined ở Frontend)
    return res.status(200).json({
      success: true,
      transCode: transCode,
      trans_code: transCode,
      code: transCode,
      amount: amount,
      qrUrl: qrUrl
    });

  } catch (error) {
    console.error('Lỗi tại /api/deposit:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ: ' + error.message
    });
  }
}
