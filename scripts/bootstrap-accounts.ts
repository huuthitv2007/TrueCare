import {createClient} from '@supabase/supabase-js';
import {normalizeEmail,normalizeUsername} from '../server/accounts.js';

const url=process.env.SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
if(!url||!secret)throw new Error('SUPABASE_URL và SUPABASE_SECRET_KEY là bắt buộc.');
const adminPassword=process.env.TRUECARE_BOOTSTRAP_ADMIN_PASSWORD;
const demoPassword=process.env.TRUECARE_BOOTSTRAP_DEMO_PASSWORD;
if(!adminPassword||!demoPassword)throw new Error('Cần TRUECARE_BOOTSTRAP_ADMIN_PASSWORD và TRUECARE_BOOTSTRAP_DEMO_PASSWORD.');
const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
async function userByEmail(email:string){
 for(let page=1;;page++){const {data,error}=await client.auth.admin.listUsers({page,perPage:1000});if(error)throw error;const found=data.users.find(user=>user.email?.toLowerCase()===email);if(found)return found;if(data.users.length<1000)return null}
}
async function upsert(emailInput:string,usernameInput:string,displayName:string,password:string,role:'admin'|'employee'){
 const email=normalizeEmail(emailInput),username=normalizeUsername(usernameInput);let user=await userByEmail(email);
 const metadata={username,displayName};const app_metadata={truecare_role:role};
 if(user){const {data,error}=await client.auth.admin.updateUserById(user.id,{password,user_metadata:metadata,app_metadata,email_confirm:true,ban_duration:'none'});if(error)throw error;user=data.user}
 else {const {data,error}=await client.auth.admin.createUser({email,password,email_confirm:true,user_metadata:metadata,app_metadata});if(error)throw error;user=data.user}
 const {error}=await client.from('employee_accounts').upsert({user_id:user!.id,email,username,display_name:displayName,role,active:true,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error;
 console.log(`Bootstrapped ${role}: ${username}`);
}
await upsert('admin@huuthi.com','admin','Quản trị TrueCare',adminPassword,'admin');
await upsert('demo@huuthi.com','demo','Nhân viên Demo',demoPassword,'employee');
