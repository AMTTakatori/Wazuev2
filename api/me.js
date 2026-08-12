import { db, tokenHash } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Vary', 'Cookie');

  if (req.method !== 'GET') {
    return res.status(405).json({ authenticated: false, message: 'Method Not Allowed' });
  }

  try {
    const supabase = db();
    const token = req.cookies?.wazue_session;

    if (!token) {
      return res.status(401).json({ authenticated: false, message: 'Chưa đăng nhập' });
    }

    const hash = tokenHash(token);

    // 1. Kiểm tra Session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('username, expires_at')
      .eq('token_hash', hash)
      .maybeSingle();

    if (sessionError) {
      console.error('Session error:', sessionError);
      return res.status(500).json({ authenticated: false, message: 'Lỗi kiểm tra session' });
    }

    if (!session) {
      return res.status(401).json({ authenticated: false, message: 'Session không hợp lệ hoặc đã hết hạn' });
    }

    if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
      await supabase.from('sessions').delete().eq('token_hash', hash);
      return res.status(401).json({ authenticated: false, message: 'Session đã hết hạn' });
    }

    // 2. Tìm thông tin User (Lớp 1: Khớp chính xác | Lớp 2: Không phân biệt hoa thường)
    let user = null;

    const { data: exactUser } = await supabase
      .from('users')
      .select('username, balance, created_at')
      .eq('username', session.username)
      .maybeSingle();

    if (exactUser) {
      user = exactUser;
    } else {
      // Tìm bằng ilike + limit(1) để chống crash nếu lệch hoa/thường
      const { data: ilikeUsers } = await supabase
        .from('users')
        .select('username, balance, created_at')
        .ilike('username', session.username)
        .limit(1);

      if (ilikeUsers && ilikeUsers.length > 0) {
        user = ilikeUsers[0];
      }
    }

    if (!user) {
      return res.status(404).json({ authenticated: false, message: 'Không tìm thấy người dùng' });
    }

    // 3. Lấy dữ liệu 3 bảng Lịch sử (Nạp tiền, Đơn hàng, Giao dịch ví)
    const targetUser = user.username;

    const [dRes, oRes, tRes] = await Promise.all([
      supabase.from('deposits').select('*').ilike('username', targetUser).order('created_at', { ascending: false }).limit(50),
      supabase.from('orders').select('*').ilike('username', targetUser).order('created_at', { ascending: false }).limit(50),
      supabase.from('wallet_transactions').select('*').ilike('username', targetUser).order('created_at', { ascending: false }).limit(50)
    ]);

    // 4. Trả về Response đầy đủ cho Frontend
    return res.status(200).json({
      authenticated: true,
      user: {
        username: user.username,
        balance: Number(user.balance || 0),
        created_at: user.created_at
      },
      deposits: dRes.data || [],
      orders: oRes.data || [],
      transactions: tRes.data || []
    });

  } catch (error) {
    console.error('Lỗi /api/me:', error);
    return res.status(500).json({ authenticated: false, message: 'Lỗi máy chủ.' });
  }
}
