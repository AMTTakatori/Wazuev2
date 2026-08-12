import { db, requireUser } from './_auth.js';
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({success:false,message:'Method Not Allowed'});
  const auth=await requireUser(req); if(!auth) return res.status(401).json({success:false,message:'Chưa đăng nhập.'});
  const code=String(req.query?.transCode||'');
  if(!/^NAP[A-Z0-9]+$/.test(code)) return res.status(400).json({success:false,message:'Mã giao dịch không hợp lệ.'});
  const {data,error}=await db().from('deposits').select('trans_code,amount,status,created_at').eq('username',auth.username).eq('trans_code',code).maybeSingle();
  if(error) return res.status(500).json({success:false,message:'Lỗi truy vấn.'});
  if(!data) return res.status(404).json({success:false,message:'Không tìm thấy giao dịch.'});
  return res.status(200).json({success:true,deposit:data});
}
