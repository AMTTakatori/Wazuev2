import { createClient } from '@supabase/supabase-js';

const ALLOWED_AMOUNTS = new Set([7000, 25000, 40000, 70000, 100000]);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const amount = Number(req.body?.amount);

    if (!ALLOWED_AMOUNTS.has(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Gói không hợp lệ'
      });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new Error('Thiếu SUPABASE_URL hoặc SUPABASE_KEY');
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );

    const orderCode =
      'WAZUE' + Math.floor(100000 + Math.random() * 900000);

    const { error } = await supabase.from('orders').insert([{
      order_code: orderCode,
      amount,
      status: 'PENDING'
    }]);

    if (error) throw error;

    const bankAcc = process.env.BANK_ACC;
    const bankId = process.env.BANK_ID;

    if (!bankAcc || !bankId) {
      throw new Error('Thiếu BANK_ACC hoặc BANK_ID');
    }

    const qrUrl =
      `https://qr.sepay.vn/img?bank=${encodeURIComponent(bankId)}` +
      `&acc=${encodeURIComponent(bankAcc)}` +
      `&template=compact&amount=${amount}` +
      `&des=${encodeURIComponent(orderCode)}`;

    return res.status(200).json({
      success: true,
      orderCode,
      qrUrl
    });
  } catch (error) {
    console.error('create-order:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
