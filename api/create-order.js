import { db, requireUser } from './_auth.js';
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({success:false,message:'Method Not Allowed'});
  const auth=await requireUser(req); if(!auth) return res.status(401).json({success:false,message:'Chưa đăng nhập.'});
  const amount=Number(req.body?.amount);
  const {data:product}=await db().from('products').select('id,name,price').eq('price',amount).eq('active',true).maybeSingle();
  if(!product) return res.status(400).json({success:false,message:'Sản phẩm không hợp lệ.'});
  const orderCode='WAZUE'+randomCode();
  const {error}=await db().from('orders').insert({username:auth.username,order_code:orderCode,product_id:product.id,product_name:product.name,amount,status:'PENDING'});
  if(error) return res.status(500).json({success:false,message:'Không tạo được đơn hàng.'});
  const bankAcc=process.env.BANK_ACC, bankId=process.env.BANK_ID;
  if(!bankAcc||!bankId) return res.status(500).json({success:false,message:'Chưa cấu hình ngân hàng.'});
  const qrUrl=`https://qr.sepay.vn/img?bank=${encodeURIComponent(bankId)}&acc=${encodeURIComponent(bankAcc)}&template=compact&amount=${amount}&des=${encodeURIComponent(orderCode)}`;
  return res.status(200).json({success:true,orderCode,qrUrl,amount,product:product.name});
}
function randomCode(){return Math.random().toString(36).slice(2,8).toUpperCase()+Date.now().toString(36).slice(-4).toUpperCase();}
