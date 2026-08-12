import { db, tokenHash, newToken } from './_auth.js';

// ĐỔI DUY NHẤT DÒNG NÀY nếu muốn đổi mức nạp tối thiểu.
const MIN_DEPOSIT = 7000;

const COOKIE_NAME = 'wazue_session';

// Thay các biến môi trường này nếu tên cấu hình SePay của project bạn khác.
// Không đặt secret/API key ở index.html.
const BANK_CODE = process.env.SEPAY_BANK_CODE || process.env.BANK_CODE || '';
const ACCOUNT_NO = process.env.SEPAY_ACCOUNT_NO || process.env.BANK_ACCOUNT_NO || '';
const ACCOUNT_NAME = process.env.SEPAY_ACCOUNT_NAME || process.env.BANK_ACCOUNT_NAME || '';

function getCookie(req, name) {
  const raw = req.headers?.cookie || '';
  const found = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function makeTransCode(username) {
  const clean = String(username || 'USER').replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || 'USER';
  return `WZ${clean}${Date.now().toString(36).toUpperCase()}${Math.floor(1000 + Math.random()*9000)}`;
}

function makeQrUrl(amount, transCode) {
  if (!BANK_CODE || !ACCOUNT_NO) return null;
  const params = new URLSearchParams({
    acc: ACCOUNT_NO,
    bank: BANK_CODE,
    amount: String(amount),
    des: transCode
  });
  if (ACCOUNT_NAME) params.set('accountName', ACCOUNT_NAME);
  return `https://img.vietqr.io/image/${encodeURIComponent(BANK_CODE)}-${encodeURIComponent(ACCOUNT_NO)}-compact2.png?${params.toString()}`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
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

    if (sessionError) throw sessionError;

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session không hợp lệ.'
      });
    }

    if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
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
        message: 'Chưa cấu hình tài khoản ngân hàng/VietQR trên server.'
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

    if (insertError) throw insertError;

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
