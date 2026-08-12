import { db, getCookie, tokenHash } from './_auth.js';
export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({success:false,message:'Method Not Allowed'});
  const token=getCookie(req,'wazue_session');
  if(token) await db().from('sessions').delete().eq('token_hash',tokenHash(token));
  res.setHeader('Set-Cookie','wazue_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0');
  return res.status(200).json({success:true});
}
