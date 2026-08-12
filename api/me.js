import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Chỉ chấp nhận phương thức GET
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    // 1. Kiểm tra cấu hình biến môi trường
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      return res.status(500).json({ success: false, message: 'Thiếu cấu hình Supabase trên Vercel' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // 2. Lấy token từ Cookie hoặc Header
    const token = req.cookies?.token || req.headers?.authorization?.replace('Bearer ', '');

    // Nếu không có token -> Báo chưa đăng nhập (401)
    if (!token) {
      return res.status(401).json({ authenticated: false, message: 'Chưa đăng nhập' });
    }

    // 3. Tra cứu session trong Supabase
    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (sessionErr || !session) {
      return res.status(401).json({ authenticated: false, message: 'Session không hợp lệ hoặc đã hết hạn' });
    }

    // 4. Lấy thông tin tài khoản
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, username, balance, created_at')
      .eq('username', session.username)
      .maybeSingle();

    if (userErr || !user) {
      return res.status(404).json({ authenticated: false, message: 'Không tìm thấy người dùng' });
    }

    // 5. Trả về thông tin người dùng thành công (200)
    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        balance: user.balance || 0
      }
    });

  } catch (error) {
    // Bắt toàn bộ ngoại lệ để không bao giờ sập server (500)
    console.error('Lỗi tại /api/me:', error);
    return res.status(500).json({ authenticated: false, message: error.message });
  }
}
