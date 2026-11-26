import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const b64=(bytes:Uint8Array)=>{let s="";for(const x of bytes)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const clientId=Deno.env.get("ZOOM_MEETING_SDK_CLIENT_ID")||"",clientSecret=Deno.env.get("ZOOM_MEETING_SDK_CLIENT_SECRET")||"";
  if(!url||!service)return json({error:"CREST session verification is not configured."},503);
  if(!clientId||!clientSecret)return json({error:"Zoom is not connected yet. Add the Zoom Meeting SDK Client ID and Client Secret to Supabase Edge Function secrets."},503);
  const b=await req.json(),role=String(b.role||""),token=String(b.session_token||"");
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  if(role==="admin"){
   const {data,error}=await db.rpc("admin_check",{p_key:String(b.admin_key||"")});
   if(error||data!==true)return json({error:"Administrator session is invalid. Sign in again."},401);
  }else if(role==="student"){
   const {data,error}=await db.rpc("student_me",{p_token:token});
   if(error||!data?.phone)return json({error:"Student session is invalid. Sign in again."},401);
  }else if(role==="teacher"){
   const {data,error}=await db.rpc("teacher_me",{p_token:token});
   if(error||!data?.id)return json({error:"Teacher session is invalid. Sign in again."},401);
  }else return json({error:"Only signed-in CREST users can join a classroom."},403);
  const meeting=String(b.meeting_number||"").replace(/[\s-]/g,"");
  if(!/^\d{9,12}$/.test(meeting))return json({error:"Enter a valid Zoom meeting number."},400);
  const now=Math.floor(Date.now()/1000)-30,exp=now+7200;
  const header=b64(new TextEncoder().encode(JSON.stringify({alg:"HS256",typ:"JWT"})));
  const payload=b64(new TextEncoder().encode(JSON.stringify({appKey:clientId,mn:meeting,role:0,iat:now,exp,tokenExp:exp})));
  const unsigned=header+"."+payload;
  const cryptoKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(clientSecret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=new Uint8Array(await crypto.subtle.sign("HMAC",cryptoKey,new TextEncoder().encode(unsigned)));
  return json({signature:unsigned+"."+b64(sig),clientId,meetingNumber:meeting});
 }catch(e){console.error("crest-zoom-signature",e);return json({error:"Could not prepare the secure Zoom meeting signature."},500);}
});