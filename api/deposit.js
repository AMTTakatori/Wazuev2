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
    
    // Đọc Cookie hoặc body để xác định người dùng
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
        console.warn('Lỗi giải mã token:', authErr.message);
      }
    }

    if (!username) {
      return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập' });
    }

    const amount = Number(req.body?.amount || 0);
    if (!amount || amount < 2000) {
      return res.status(400).json({ success: false, message: 'Số tiền tối thiểu là 2.000đ' });
    }

    // Tạo mã đơn dạng WZ + USER + RANDOM
    const cleanUser = username.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    const transCode = `WZ${cleanUser}${randomPart}`;

    const { error: dbErr } = await supabase.from('deposits').insert([{
      username: username,
      trans_code: transCode,
      amount: amount,
      status: 'PENDING'
    }]);

    if (dbErr) {
      return res.status(500).json({ success: false, message: 'Lỗi tạo đơn trong DB' });
    }

    const bankId = process.env.BANK_ID || 'MB';
    const bankAcc = process.env.BANK_ACC || '9006688668';
    const qrUrl = `https://qr.sepay.vn/img?bank=${bankId}&acc=${bankAcc}&template=compact&amount=${amount}&des=${transCode}`;

    return res.status(200).json({
      success: true,
      transCode: transCode,
      trans_code: transCode,
      code: transCode,
      amount: amount,
      qrUrl: qrUrl
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
}
