import { db } from './_auth.js';
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({success:false,message:'Method Not Allowed'});
  const {data,error}=await db().from('products').select('id,slug,name,description,price,category,days,active').eq('active',true).order('sort_order',{ascending:true}).order('price',{ascending:true});
  if(error) return res.status(500).json({success:false,message:'Không thể tải sản phẩm.'});
  return res.status(200).json({success:true,products:data||[]});
}
