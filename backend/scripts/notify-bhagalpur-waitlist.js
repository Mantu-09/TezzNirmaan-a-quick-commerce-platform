// One-off script: Fire Bhagalpur waitlist SMS blast — P6-7
// Run: node --env-file=.env scripts/notify-bhagalpur-waitlist.js

import { createClient } from '@supabase/supabase-js';
import { notifyWaitlist } from '../src/services/city-notification.service.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

console.log('🔍 Looking up Bhagalpur city ID...');

const { data, error } = await supabaseAdmin
  .from('cities')
  .select('id, name, is_active')
  .eq('name', 'Bhagalpur')
  .single();

if (error || !data) {
  console.error('❌ Failed to fetch Bhagalpur city:', error?.message || 'not found');
  process.exit(1);
}

console.log(`✅ Found city: ${data.name} (${data.id})`);
console.log(`   is_active: ${data.is_active}`);

if (!data.is_active) {
  console.warn('⚠️  Bhagalpur is not yet active in the database!');
  console.warn('   Run the SQL first: UPDATE cities SET is_active=true WHERE name=\'Bhagalpur\';');
  process.exit(1);
}

console.log('📱 Firing waitlist SMS blast...');
await notifyWaitlist(data.id, data.name);
console.log('✅ Done. Check backend logs above for sent/failed counts.');
