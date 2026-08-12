import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ success: false, message: 'Chỉ hỗ trợ POST' });
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    const body = req.body || {};

    const rawContent = String(body.content || body.transactionContent || body.description || '').trim();
    const transferAmount = Number(body.transferAmount || body.amountIn || body.amount || 0);

    if (!rawContent) {
      return res.status(200).json({ success: true, message: 'Nội dung rỗng' });
    }

    // 1. Tìm đơn PENDING
    const { data: pendingDeposits } = await supabase
      .from('deposits')
      .select('*')
      .or('status.eq.PENDING,status.eq.pending');

    if (!pendingDeposits || pendingDeposits.length === 0) {
      return res.status(200).json({ success: true, message: 'Không có đơn PENDING' });
    }

    // 2. Khớp mã đơn chuyển khoản
    const cleanContent = rawContent.toUpperCase().replace(/\s+/g, '');
    const matchedDeposit = pendingDeposits.find(d => {
      if (!d.trans_code) return false;
      return cleanContent.includes(d.trans_code.trim().toUpperCase());
    });

    if (!matchedDeposit) {
      return res.status(200).json({ success: true, message: 'Không tìm thấy mã đơn' });
    }

    // 3. Đổi trạng thái đơn nạp sang COMPLETED theo trans_code
    await supabase
      .from('deposits')
      .update({ status: 'COMPLETED' })
      .eq('trans_code', matchedDeposit.trans_code);

    // 4. Cộng tiền vào ví User (dùng ilike tránh lệch hoa/thường)
    const { data: user } = await supabase
      .from('users')
      .select('balance, username')
      .ilike('username', matchedDeposit.username)
      .maybeSingle();

    if (user) {
      const currentBal = Number(user.balance || 0);
      const addAmount = Number(matchedDeposit.amount || transferAmount);
      const newBal = currentBal + addAmount;

      await supabase
        .from('users')
        .update({ balance: newBal })
        .ilike('username', user.username);

      // 5. Ghi nhận giao dịch ví
      try {
        await supabase.from('wallet_transactions').insert([{
          username: user.username,
          type: 'DEPOSIT',
          amount: addAmount,
          reference: matchedDeposit.trans_code,
          status: 'COMPLETED'
        }]);
      } catch (txErr) {
        console.warn('Lỗi ghi log ví:', txErr.message);
      }
    }

    return res.status(200).json({ success: true, message: 'Đã duyệt đơn nạp và cộng tiền' });

  } catch (err) {
    return res.status(200).json({ success: false, error: err.message });
  }
}
