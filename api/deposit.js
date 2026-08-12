import { db, requireUser } from './_auth.js';
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({success:false,message:'Method Not Allowed'});
  const auth=await requireUser(req); if(!auth) return res.status(401).json({success:false,message:'Chưa đăng nhập.'});
  const amount=Number(req.body?.amount);
  if(!Number.isInteger(amount)||amount<10000||amount>50000000) return res.status(400).json({success:false,message:'Số tiền nạp phải từ 10.000đ đến 50.000.000đ.'});
  const transCode='NAP'+cryptoRandom();
  const {error}=await db().from('deposits').insert({username:auth.username,trans_code:transCode,amount,status:'PENDING'});
  if(error) return res.status(500).json({success:false,message:'Không tạo được giao dịch.'});
  const bankAcc=process.env.BANK_ACC, bankId=process.env.BANK_ID;
  if(!bankAcc||!bankId) return res.status(500).json({success:false,message:'Chưa cấu hình ngân hàng.'});
  const qrUrl=`https://qr.sepay.vn/img?bank=${encodeURIComponent(bankId)}&acc=${encodeURIComponent(bankAcc)}&template=compact&amount=${amount}&des=${encodeURIComponent(transCode)}`;
  return res.status(200).json({success:true,transCode,amount,qrUrl});
}
function cryptoRandom(){return Math.random().toString(36).slice(2,8).toUpperCase()+Date.now().toString(36).slice(-4).toUpperCase();}
