import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.trim().startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const { data: m } = await sb.from("account_members").select("account_id").eq("email","voicetest@dougbro55.test").single();
const { data } = await sb.from("clients").select("full_name,role,phone,email").eq("account_id", m.account_id);
for (const c of data) console.log(`- ${c.full_name} (${c.role}) ${c.phone||""} ${c.email||""}`);
