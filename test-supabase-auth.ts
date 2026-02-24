import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function runAuthDiagnostic() {
  console.log("=== 🔐 SUPABASE AUTH & SMTP DIAGNOSTIC ===");

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERROR: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment variables.");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const testEmail = `test-auth-${Date.now()}@melaniacalvin.com`;
  const testPassword = "TestPassword123!";

  console.log(`Attempting to sign up new user: ${testEmail}`);
  console.log("Waiting for Supabase to connect to Resend SMTP...");

  const { data, error } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });

  if (error) {
    console.error("\n❌ SIGNUP FAILED. Supabase could not send the email.");
    console.error("Error Message:", error.message);
    console.error("Error Status:", error.status);
    console.error("Raw Error Object:", JSON.stringify(error, null, 2));
    console.log("\n💡 TIP: If the error mentions SMTP, check your Supabase Project Settings -> Authentication -> SMTP.");
  } else {
    console.log("\n✅ SIGNUP SUCCESS!");
    console.log(`Supabase successfully handed the email to Resend. Check the inbox for ${testEmail}.`);
  }
}

runAuthDiagnostic();
