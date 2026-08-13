import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    
    // Lấy toàn bộ danh sách sản phẩm từ bảng products
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Lỗi Supabase get-products:', error);
      return res.status(500).json({ success: false, message: error.message });
    }

    // Trả về trực tiếp mảng sản phẩm
    return res.status(200).json(data || []);

  } catch (err) {
    console.error('Lỗi get-products:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
