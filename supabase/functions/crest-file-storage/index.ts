import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const clean=(s:string)=>s.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120);
const buckets=new Set(["crest-learning-materials","crest-lesson-media","crest-student-submissions","crest-private-records"]);
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!key)return json({error:"Storage service is not configured."},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let b:Record<string,unknown>={},file:File|null=null;
  if((req.headers.get("content-type")||"").includes("multipart/form-data")){
   const f=await req.formData();b=Object.fromEntries([...f.entries()].filter(([k])=>k!=="file"));
   const v=f.get("file");if(v instanceof File)file=v;
  }else b=await req.json();
  const role=String(b.role||""),token=String(b.session_token||"");
  let person:Record<string,unknown>={};
  if(role==="admin"){
   const {data,error}=await db.rpc("admin_check",{p_key:String(b.admin_key||"")});
   if(error||data!==true)return json({error:"Administrator session is invalid. Sign in again."},401);
  }else if(role==="student"){
   const {data,error}=await db.rpc("student_me",{p_token:token});
   if(error||!data?.phone)return json({error:"Student session is invalid. Sign in again."},401);person=data;
  }else if(role==="teacher"){
   const {data,error}=await db.rpc("teacher_me",{p_token:token});
   if(error||!data?.id)return json({error:"Teacher session is invalid. Sign in again."},401);person=data;
  }else return json({error:"This account type cannot access school storage."},403);
  const admin=role==="admin",phone=String(person.phone||""),teacherId=String(person.id||"");
  const forms=Array.isArray(person.forms)?person.forms.map(String):[];
  const action=String(b.action||""),bucket=String(b.bucket||"");
  if(!buckets.has(bucket))return json({error:"Unknown storage area."},400);
  const canRead=async(path:string)=>{
   if(admin)return true;
   if(role==="student")return path.startsWith("students/"+phone+"/")||(["crest-learning-materials","crest-lesson-media"].includes(bucket)&&path.startsWith("published/"));
   if(role==="teacher"){
    if(path.startsWith("pending/teachers/"+teacherId+"/"))return true;
    if(["crest-learning-materials","crest-lesson-media"].includes(bucket)&&path.startsWith("published/"))return true;
    const m=path.match(/^students\/([^/]+)\//);
    if(m&&bucket==="crest-student-submissions"){
     const {data}=await db.from("crest_students").select("form").eq("phone",m[1]).maybeSingle();
     return !!data&&forms.includes(String(data.form||""));
    }
   }
   return false;
  };
  if(action==="upload"){
   if(!file)return json({error:"Choose a file first."},400);
   if(role==="teacher"&&!["crest-learning-materials","crest-lesson-media"].includes(bucket))return json({error:"Teachers can upload learning materials and lesson media only."},403);
   if(role==="student"&&bucket!=="crest-student-submissions")return json({error:"Students can upload their own submissions only."},403);
   const folder=admin?((["crest-learning-materials","crest-lesson-media"].includes(bucket))?"published":"admin"):role==="teacher"?"pending/teachers/"+teacherId:"students/"+phone;
   const path=folder+"/"+crypto.randomUUID()+"-"+clean(file.name||"upload");
   const {data,error}=await db.storage.from(bucket).upload(path,file,{contentType:file.type||"application/octet-stream",upsert:false});
   if(error)return json({error:error.message},400);
   return json({ok:true,bucket,path:data.path,name:file.name,size:file.size});
  }
  if(action==="list"){
   const prefix=String(b.prefix||"");
   if(admin){const {data,error}=await db.storage.from(bucket).list(prefix,{limit:100,sortBy:{column:"created_at",order:"desc"}});if(error)return json({error:error.message},400);return json({ok:true,files:data||[]});}
   const prefixes:string[]=[];
   if(role==="student"){if(bucket==="crest-student-submissions")prefixes.push("students/"+phone);if(["crest-learning-materials","crest-lesson-media"].includes(bucket))prefixes.push("published");}
   if(role==="teacher"){
    if(["crest-learning-materials","crest-lesson-media"].includes(bucket))prefixes.push("pending/teachers/"+teacherId,"published");
    if(bucket==="crest-student-submissions"){const {data}=await db.from("crest_students").select("phone").in("form",forms);for(const s of data||[])prefixes.push("students/"+s.phone);}
   }
   const files:unknown[]=[];for(const p of prefixes){const {data}=await db.storage.from(bucket).list(p,{limit:100,sortBy:{column:"created_at",order:"desc"}});if(data)files.push(...data.map(x=>({...x,folder:p})));}
   return json({ok:true,files});
  }
  if(action==="signed-url"){
   const path=String(b.path||"");if(!path||!(await canRead(path)))return json({error:"You do not have permission to open this file."},403);
   const {data,error}=await db.storage.from(bucket).createSignedUrl(path,300);if(error||!data?.signedUrl)return json({error:error?.message||"Could not create link."},400);
   return json({ok:true,signedUrl:data.signedUrl,expiresIn:300});
  }
  if(action==="publish"){
   if(!admin)return json({error:"Only administrators can publish school files."},403);
   if(!["crest-learning-materials","crest-lesson-media"].includes(bucket))return json({error:"This bucket cannot be published."},400);
   const source=String(b.path||"");if(!source.startsWith("pending/teachers/"))return json({error:"Only pending teacher uploads can be published."},400);
   const dest="published/"+crypto.randomUUID()+"-"+clean(source.split("/").pop()||"resource");
   const {error}=await db.storage.from(bucket).move(source,dest);if(error)return json({error:error.message},400);
   return json({ok:true,path:dest,status:"published"});
  }
  if(action==="delete"){
   if(!admin)return json({error:"Only administrators can delete stored files."},403);
   const path=String(b.path||"");if(!path)return json({error:"File path required."},400);
   const {error}=await db.storage.from(bucket).remove([path]);if(error)return json({error:error.message},400);return json({ok:true});
  }
  return json({error:"Unsupported storage action."},400);
 }catch(e){console.error("crest-file-storage",e);return json({error:"CREST storage request failed."},500);}
});