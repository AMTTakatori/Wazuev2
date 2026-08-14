import { createClient } from '@supabase/supabase-js';
import { createNetlifyHandler } from './_adapter.js';

async function getProductsHandler(req, res) {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

    // Lấy sản phẩm và sắp xếp theo sort_order tăng dần (số nhỏ xếp trước)
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(products || []);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export default getProductsHandler;
export const handler = createNetlifyHandler(getProductsHandler);
