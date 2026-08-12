import { db, requireUser } from './_auth.js';
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({success:false,message:'Method Not Allowed'});
  const auth=await requireUser(req); if(!auth) return res.status(401).json({success:false,message:'Chưa đăng nhập.'});
  const supabase=db();
  const [{data:user,error:uErr},{data:deposits,error:dErr},{data:orders,error:oErr},{data:txs,error:tErr}]=await Promise.all([
    supabase.from('users').select('username,balance,created_at').eq('username',auth.username).single(),
    supabase.from('deposits').select('id,trans_code,amount,status,created_at').eq('username',auth.username).order('created_at',{ascending:false}).limit(50),
    supabase.from('orders').select('order_code,product_name,amount,status,account,created_at').eq('username',auth.username).order('created_at',{ascending:false}).limit(50),
    supabase.from('wallet_transactions').select('id,type,amount,reference,status,created_at').eq('username',auth.username).order('created_at',{ascending:false}).limit(100)
  ]);
  if(uErr||dErr||oErr||tErr) return res.status(500).json({success:false,message:'Không thể tải dữ liệu tài khoản.'});
  return res.status(200).json({success:true,user,deposits:deposits||[],orders:orders||[],transactions:txs||[]});
}
