import crypto from 'node:crypto';
import { db } from './_auth.js';

function safeEqual(a,b){const aa=Buffer.from(String(a||''));const bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function verifyHmac(req, rawBody){
  const secret=process.env.SEPAY_WEBHOOK_SECRET;
  if(!secret) return false;
  const timestamp=req.headers['x-sepay-timestamp'];
  const signature=req.headers['x-sepay-signature'];
  if(!timestamp||!signature) return false;
  const ts=Number(timestamp); if(!Number.isFinite(ts)||Math.abs(Date.now()-ts*1000)>5*60*1000) return false;
  const payload=`${timestamp}.${rawBody}`;
  const expected=crypto.createHmac('sha256',secret).update(payload).digest('hex');
  return safeEqual(expected,signature);
}
export const config = { api: { bodyParser: false } };

async function readRawBody(req){
  const chunks=[];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({success:false,message:'Method Not Allowed'});
  try{
    const raw=await readRawBody(req);
    if(process.env.SEPAY_WEBHOOK_SECRET && !verifyHmac(req,raw)) return res.status(401).json({success:false,message:'Invalid signature'});
    const data=JSON.parse(raw || '{}');
    const content=String(data.content||'');
    const amount=Number(data.transferAmount||0);
    const txId=String(data.id||data.transactionId||data.referenceCode||'');
    const depositMatch=content.match(/NAP[A-Z0-9]+/i);
    const orderMatch=content.match(/WAZUE[A-Z0-9]+/i);
    const supabase=db();

    if(depositMatch){
      const code=depositMatch[0].toUpperCase();
      const {data:dep}=await supabase.from('deposits').select('*').eq('trans_code',code).eq('status','PENDING').maybeSingle();
      if(dep && amount>=Number(dep.amount)){
        const {data:credited,error}=await supabase.rpc('credit_deposit',{p_deposit_id:dep.id,p_transaction_id:txId||code});
        if(error) throw error;
        return res.status(200).json({success:true,processed:Boolean(credited)});
      }
      return res.status(200).json({success:true,processed:false});
    }

    if(orderMatch){
      const code=orderMatch[0].toUpperCase();
      const {data:order}=await supabase.from('orders').select('id,username,amount,status,product_id').eq('order_code',code).maybeSingle();
      if(!order || order.status!=='PENDING' || amount!==Number(order.amount)) return res.status(200).json({success:true,processed:false});
      // Product fulfillment for Qling-based products.
      const {data:product}=await supabase.from('products').select('provider,days').eq('id',order.product_id).maybeSingle();
      if(product?.provider==='qling'){
        const account=await createQlingAccount(Number(product.days||1));
        if(!account.success) return res.status(500).json({success:false,message:'Fulfillment failed'});
        const {error}=await supabase.from('orders').update({status:'COMPLETED',account:account.account}).eq('id',order.id).eq('status','PENDING');
        if(error) throw error;
      }else{
        const {error}=await supabase.from('orders').update({status:'COMPLETED'}).eq('id',order.id).eq('status','PENDING');
        if(error) throw error;
      }
      return res.status(200).json({success:true,processed:true});
    }
    return res.status(200).json({success:true,processed:false});
  }catch(e){console.error(e);return res.status(500).json({success:false,message:'Webhook error'});}
}
async function createQlingAccount(days){
  const base=process.env.QLING_BASE_URL, key=process.env.QLING_CTV_KEY, prefix=process.env.QLING_PREFIX;
  if(!base||!key||!prefix) return {success:false};
  const r=Math.random().toString(36).slice(2,8); const username=`${prefix}-${r}`; const password=`Wz@${Math.random().toString(36).slice(2,8)}`;
  const headers={'Content-Type':'application/json','X-Ctv-Key':key};
  const c=await fetch(`${base}/api/ctv/users`,{method:'POST',headers,body:JSON.stringify({username,password})});
  if(!c.ok) return {success:false};
  const u=await fetch(`${base}/api/ctv/users/${encodeURIComponent(username)}`,{method:'PUT',headers,body:JSON.stringify({plan:1,extend_days:days,mode:'Aimdrag_Anten'})});
  if(!u.ok) return {success:false};
  return {success:true,account:`${username}|${password}`};
}
