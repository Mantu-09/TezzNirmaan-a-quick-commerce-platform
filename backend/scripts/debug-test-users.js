// Debug: Check what listUsers actually returns for our test phones
import { createClient } from '@supabase/supabase-js';

const testAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data, error } = await testAdmin.auth.admin.listUsers({ perPage: 50 });
if (error) { console.error(error); process.exit(1); }

// Find test users
const testUsers = data.users.filter(u =>
  u.email?.includes('tezznirmaan.internal') ||
  u.phone?.includes('+919000000') ||
  u.phone?.includes('+918100000')
);

console.log('Test users found:', testUsers.length);
testUsers.forEach(u => {
  console.log({
    id: u.id,
    email: u.email,
    phone: u.phone,
    phone_confirmed_at: u.phone_confirmed_at,
    user_metadata_phone: u.user_metadata?.phone,
  });
});
