import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // 1. Nhận mã giao dịch từ tất cả các kiểu đặt tên tham số
    const code = req.query?.transCode || req.query?.trans_code || req.query?.code;

    // 2. Xử lý an toàn nếu mã chưa sẵn sàng hoặc truyền dạng chuỗi 'undefined'/'null'
    if (!code || code === 'undefined' || code === 'null') {
      return res.status(200).json({
        success: false,
        message: 'Đang chờ mã giao dịch hợp lệ...'
      });
    }

    // 3. Tra cứu đơn nạp trong Supabase
    const { data: deposit, error } = await supabase
      .from('deposits')
      .select('*')
      .eq('trans_code', code)
      .maybeSingle();

    if (error) {
      console.error('Lỗi tra cứu check-deposit:', error);
      return res.status(200).json({
        success: false,
        message: 'Lỗi khi kiểm tra trạng thái đơn.'
      });
    }

    if (!deposit) {
      return res.status(200).json({
        success: false,
        message: 'Chưa tìm thấy thông tin đơn nạp.'
      });
    }

    // 4. Trả về kết quả khớp trạng thái (COMPLETED / PENDING)
    return res.status(200).json({
      success: true,
      deposit: {
        id: deposit.id,
        username: deposit.username,
        transCode: deposit.trans_code,
        trans_code: deposit.trans_code,
        code: deposit.trans_code,
        amount: Number(deposit.amount || 0),
        status: deposit.status
      }
    });

  } catch (error) {
    console.error('Lỗi tại /api/check-deposit:', error);
    return res.status(200).json({
      success: false,
      message: 'Lỗi máy chủ: ' + error.message
    });
  }
}
