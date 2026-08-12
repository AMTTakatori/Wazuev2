import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // Đọc tất cả các biến tham số có thể gửi từ Frontend
    const code = req.query?.transCode || req.query?.trans_code || req.query?.code;

    if (!code || code === 'undefined' || code === 'null') {
      return res.status(200).json({ success: false, message: 'Đang chờ mã đơn...' });
    }

    const { data: deposit, error } = await supabase
      .from('deposits')
      .select('*')
      .eq('trans_code', code)
      .maybeSingle();

    if (error || !deposit) {
      return res.status(200).json({ success: false, message: 'Chưa tìm thấy đơn' });
    }

    return res.status(200).json({
      success: true,
      deposit: {
        id: deposit.id,
        username: deposit.username,
        transCode: deposit.trans_code,
        trans_code: deposit.trans_code,
        amount: Number(deposit.amount || 0),
        status: deposit.status
      }
    });

  } catch (error) {
    return res.status(200).json({ success: false, error: error.message });
  }
}
