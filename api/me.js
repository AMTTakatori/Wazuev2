import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    // 1. Kiểm tra biến môi trường
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      return res.status(200).json({ authenticated: false, message: 'Thiếu cấu hình Supabase' });
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    
    // 2. Lấy token an toàn từ Cookie hoặc Header
    const token = req.cookies?.token || req.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(200).json({ authenticated: false, user: null });
    }

    // 3. Tìm session
    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (sessionErr || !session) {
      return res.status(200).json({ authenticated: false, user: null });
    }

    // 4. Lấy thông tin user
    const { data: user } = await supabase
      .from('users')
      .select('id, username, balance')
      .eq('username', session.username)
      .maybeSingle();

    return res.status(200).json({
      authenticated: true,
      user: user || { username: session.username, balance: 0 }
    });

  } catch (error) {
    // Bắt toàn bộ lỗi crash và trả về JSON thay vì báo 500
    console.error('Lỗi API /api/me:', error);
    return res.status(200).json({ authenticated: false, error: error.message });
  }
}
