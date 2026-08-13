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

async function depositHandler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // 1. Lấy thông tin tài khoản đăng nhập
    const cookies = req.cookies || parseCookies(req);
    const token = cookies?.wazue_session;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để nạp tiền' });
    }

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
    } catch (authErr) {}

    if (!username) {
      return res.status(401).json({ success: false, message: 'Phiên đăng nhập hết hạn' });
    }

    const { amount } = req.body || {};
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 10000) {
      return res.status(400).json({ success: false, message: 'Số tiền nạp tối thiểu là 10.000đ' });
    }

    // 2. Cấu hình Ngân hàng (Lấy từ biến Vercel hoặc dùng mặc định)
    const bankId = process.env.BANK_ID || 'MB';
    const bankAcc = process.env.BANK_ACC || '0000000000';
    const accountName = process.env.ACCOUNT_NAME || 'WAZUE STORE';

    // 3. Tạo mã giao dịch ngẫu nhiên
    const transCode = 'NAP' + Math.floor(100000 + Math.random() * 900000);

    // 4. Tạo đường link VietQR chuẩn
    const qrCode = `https://img.vietqr.io/image/${bankId}-${bankAcc}-compact2.png?amount=${numAmount}&addInfo=${transCode}&accountName=${encodeURIComponent(accountName)}`;

    // 5. Lưu đơn nạp vào Supabase
    const { error: dbError } = await supabase.from('deposits').insert([{
      username: username.toLowerCase(),
      trans_code: transCode,
      amount: numAmount,
      status: 'PENDING'
    }]);

    if (dbError) {
      console.error('Lỗi lưu đơn nạp:', dbError);
      return res.status(500).json({ success: false, message: 'Lỗi Database: ' + dbError.message });
    }

    return res.status(200).json({
      success: true,
      message: 'Tạo mã nạp tiền thành công',
      transCode,
      trans_code: transCode,
      amount: numAmount,
      qrCode,
      qr_url: qrCode
    });

  } catch (error) {
    console.error('Lỗi nạp tiền:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

export default depositHandler;
export const handler = createNetlifyHandler(depositHandler);
