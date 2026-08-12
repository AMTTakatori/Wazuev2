import { db, tokenHash } from './_auth.js';

// ĐỔI DUY NHẤT DÒNG NÀY để thay đổi số tiền nạp tối thiểu.
const MIN_DEPOSIT = 7000;

// Cấu hình ngân hàng hiện tại của Wazue.
const BANK_ACC = process.env.BANK_ACC || '';
const BANK_ID = process.env.BANK_ID || 'MB';

const COOKIE_NAME = 'wazue_session';

function getCookie(req, name) {
  const raw = req.headers?.cookie || '';
  const found = raw
    .split(';')
    .map(x => x.trim())
    .find(x => x.startsWith(name + '='));

  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function makeTransCode(username) {
  const clean = String(username || 'USER')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 10) || 'USER';

  return `WZ${clean}${Date.now().toString(36).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}`;
}

function makeQrUrl(amount, transCode) {
  if (!BANK_ACC || !BANK_ID) return null;

  return `https://img.vietqr.io/image/${encodeURIComponent(BANK_ID)}-${encodeURIComponent(BANK_ACC)}-compact2.png?amount=${encodeURIComponent(amount)}&addInfo=${encodeURIComponent(transCode)}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method Not Allowed'
    });
  }

  try {
    const token = getCookie(req, COOKIE_NAME);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Vui lòng đăng nhập.'
      });
    }

    const supabase = db();
    const hash = tokenHash(token);

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('username, expires_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (sessionError) {
      console.error('Session error:', sessionError);
      return res.status(500).json({
        success: false,
        message: 'Lỗi kiểm tra session.'
      });
    }

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session không hợp lệ.'
      });
    }

    if (
      session.expires_at &&
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      await supabase
        .from('sessions')
        .delete()
        .eq('token_hash', hash);

      return res.status(401).json({
        success: false,
        message: 'Session đã hết hạn.'
      });
    }

    const amount = Number(req.body?.amount);

    if (!Number.isInteger(amount) || amount < MIN_DEPOSIT) {
      return res.status(400).json({
        success: false,
        message: `Số tiền nạp tối thiểu là ${MIN_DEPOSIT.toLocaleString('vi-VN')}đ.`
      });
    }

    const transCode = makeTransCode(session.username);
    const qrUrl = makeQrUrl(amount, transCode);

    if (!qrUrl) {
      return res.status(500).json({
        success: false,
        message: 'Chưa cấu hình BANK_ACC hoặc BANK_ID trên Vercel.'
      });
    }

    const { error: insertError } = await supabase
      .from('deposits')
      .insert({
        username: session.username,
        amount,
        trans_code: transCode,
        status: 'PENDING'
      });

    if (insertError) {
      console.error('Deposit insert error:', insertError);
      return res.status(500).json({
        success: false,
        message: 'Không thể tạo giao dịch nạp tiền.'
      });
    }

    return res.status(200).json({
      success: true,
      amount,
      transCode,
      qrUrl,
      minDeposit: MIN_DEPOSIT
    });

  } catch (error) {
    console.error('Lỗi /api/deposit:', error);

    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ.'
    });
  }
}
