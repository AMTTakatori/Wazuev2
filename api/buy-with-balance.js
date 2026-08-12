import { db, requireUser } from './_auth.js';
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({success:false,message:'Method Not Allowed'});
  const auth=await requireUser(req); if(!auth) return res.status(401).json({success:false,message:'Chưa đăng nhập.'});
  const productId=Number(req.body?.productId); if(!Number.isInteger(productId)) return res.status(400).json({success:false,message:'Sản phẩm không hợp lệ.'});
  const supabase=db();
  const {data:reserve,error}=await supabase.rpc('reserve_purchase',{p_username:auth.username,p_product_id:productId});
  if(error){console.error(error);return res.status(400).json({success:false,message:error.message});}
  if(!reserve?.success) return res.status(400).json(reserve||{success:false,message:'Không thể tạo đơn.'});
  const {data:product}=await supabase.from('products').select('provider,days').eq('id',productId).single();
  if(!product) return res.status(500).json({success:false,message:'Không tìm thấy sản phẩm.'});
  let account=null;
  if(product.provider==='qling'){
    const r=await createQlingAccount(Number(product.days||1));
    if(!r.success){await supabase.rpc('cancel_purchase',{p_order_id:reserve.orderId});return res.status(502).json({success:false,message:'Không thể cấp sản phẩm, tiền đã được hoàn lại.'});}
    account=r.account;
  }
  const {error:finishErr}=await supabase.rpc('complete_purchase',{p_order_id:reserve.orderId,p_account:account});
  if(finishErr){console.error(finishErr);return res.status(500).json({success:false,message:'Đã tạo sản phẩm nhưng chưa ghi nhận đơn, liên hệ quản trị viên.'});}
  return res.status(200).json({success:true,account,orderCode:reserve.orderCode,balance:reserve.balance});
}
async function createQlingAccount(days){
  const base=process.env.QLING_BASE_URL,key=process.env.QLING_CTV_KEY,prefix=process.env.QLING_PREFIX;if(!base||!key||!prefix)return{success:false};
  const r=Math.random().toString(36).slice(2,8);const username=`${prefix}-${r}`,password=`Wz@${Math.random().toString(36).slice(2,8)}`;const headers={'Content-Type':'application/json','X-Ctv-Key':key};
  const c=await fetch(`${base}/api/ctv/users`,{method:'POST',headers,body:JSON.stringify({username,password})});if(!c.ok)return{success:false};
  const u=await fetch(`${base}/api/ctv/users/${encodeURIComponent(username)}`,{method:'PUT',headers,body:JSON.stringify({plan:1,extend_days:days,mode:'Aimdrag_Anten'})});if(!u.ok)return{success:false};
  return{success:true,account:`${username}|${password}`};
}
