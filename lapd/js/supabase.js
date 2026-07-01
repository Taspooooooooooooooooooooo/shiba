/* ==========================================================
   LAPD Internal Management System
   supabase.js
   Build v1.0.0
========================================================== */

/* ==========================================================
   SUPABASE CONFIGURATION
========================================================== */

const SUPABASE_URL =
"https://vtqyqzuhifzqzqszhtwq.supabase.co";

const SUPABASE_KEY =
"sb_publishable_NunfAEMxNJA39nzFxtn42g_hsmzxcv8";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

/* ==========================================================
   CONNECTION TEST
========================================================== */

async function testConnection(){

    try{

        const {error} = await supabaseClient
        .from("users")
        .select("*")
        .limit(1);

        if(error){

            console.error(error);

            return false;

        }

        console.log("✅ Database Connected");

        return true;

    }

    catch(e){

        console.error(e);

        return false;

    }

}

/* ==========================================================
   LOGIN
========================================================== */

async function loginUser(username,password){

    const {data,error} = await supabaseClient

    .from("users")

    .select("*")

    .eq("username",username)

    .eq("password",password)

    .single();

    if(error){

        return null;

    }

    return data;

}

/* ==========================================================
   PIN
========================================================== */

async function verifyPin(userId,pin){

    const {data,error}=await supabaseClient

    .from("users")

    .select("*")

    .eq("id",userId)

    .eq("pin",pin)

    .single();

    if(error){

        return false;

    }

    return true;

}

/* ==========================================================
   UPDATE LAST LOGIN
========================================================== */

async function updateLastLogin(userId){

    await supabaseClient

    .from("users")

    .update({

        last_login:new Date()

    })

    .eq("id",userId);

}

/* ==========================================================
   LOG ACTION
========================================================== */

async function createAuditLog(

    action,

    username

){

    await supabaseClient

    .from("audit_logs")

    .insert({

        username,

        action,

        created_at:new Date()

    });

}

/* ==========================================================
   GENERATE ACTION ID
========================================================== */

function generateActionID(){

    const chars=

"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let id="ACT-";

    for(let i=0;i<18;i++){

        id+=chars[Math.floor(

Math.random()*chars.length)];

    }

    return id;

}

/* ==========================================================
   STARTUP
========================================================== */

testConnection();
