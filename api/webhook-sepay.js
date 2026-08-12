import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ success: false, message: 'Chỉ chấp nhận POST' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const body = req.body || {};

    // 1. Trích xuất thông tin từ Payload SePay (Hỗ trợ mọi dạng biến)
    const rawContent = String(body.content || body.transactionContent || body.description || '').trim();
    const transferAmount = Number(body.transferAmount || body.amountIn || body.amount || 0);

    console.log('===> SEPAY WEBHOOK INCOMING:', { rawContent, transferAmount });

    if (!rawContent) {
      return res.status(200).json({ success: true, message: 'Nội dung rỗng' });
    }

    // 2. Lấy danh sách các đơn nạp đang PENDING trong DB
    const { data: pendingDeposits, error: depErr } = await supabase
      .from('deposits')
      .select('*')
      .or('status.eq.PENDING,status.eq.pending');

    if (depErr || !pendingDeposits || pendingDeposits.length === 0) {
      return res.status(200).json({ success: true, message: 'Không có đơn PENDING' });
    }

    // 3. Khớp mã chuyển khoản (Chuẩn hóa chữ hoa và xóa khoảng trắng)
    const cleanContent = rawContent.toUpperCase().replace(/\s+/g, '');
    const matchedDeposit = pendingDeposits.find(d => {
      if (!d.trans_code) return false;
      const cleanCode = d.trans_code.trim().toUpperCase();
      return cleanContent.includes(cleanCode);
    });

    if (!matchedDeposit) {
      return res.status(200).json({ success: true, message: 'Không tìm thấy đơn nạp khớp nội dung' });
    }

    // 4. Cập nhật đơn nạp thành COMPLETED
    await supabase
      .from('deposits')
      .update({ status: 'COMPLETED' })
      .eq('id', matchedDeposit.id);

    // 5. Cộng tiền vào tài khoản User
    const { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('username', matchedDeposit.username)
      .maybeSingle();

    const currentBal = Number(user?.balance || 0);
    const addAmount = Number(matchedDeposit.amount || transferAmount);
    const newBal = currentBal + addAmount;

    await supabase
      .from('users')
      .update({ balance: newBal })
      .eq('username', matchedDeposit.username);

    // 6. Lưu lịch sử giao dịch Ví
    try {
      await supabase.from('wallet_transactions').insert([{
        username: matchedDeposit.username,
        type: 'DEPOSIT',
        amount: addAmount,
        reference: matchedDeposit.trans_code,
        status: 'COMPLETED'
      }]);
    } catch (txErr) {
      console.warn('Ghi wallet_transactions thất bại:', txErr.message);
    }

    console.log(`SUCCESS: Đã cộng ${addAmount}đ cho ${matchedDeposit.username}`);
    return res.status(200).json({ success: true, message: 'Duyệt đơn nạp thành công' });

  } catch (err) {
    console.error('Lỗi Webhook:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
}
