import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { orderCode } = req.query;

    if (!orderCode) {
      return res.status(400).json({ success: false, message: 'Thiếu orderCode' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    const { data, error } = await supabase
      .from('orders')
      .select('status, account')
      .eq('order_code', orderCode)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        status: 'NOT_FOUND',
        message: 'Không tìm thấy đơn hàng'
      });
    }

    return res.status(200).json({
      success: true,
      status: data.status,
      account: data.account || null
    });
  } catch (error) {
    console.error('check-order:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
