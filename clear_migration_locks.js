import dotenv from 'dotenv';
dotenv.config();

import { supabase } from './src/services/supabase.js';

console.log('\n🔧 CLEARING MIGRATION LOCKS...\n');

try {
  // Delete all migration locks
  const { error } = await supabase
    .from('migration_control')
    .delete()
    .neq('migration_month', '0000-00'); // delete all records

  if (error) {
    console.error('❌ Error clearing locks:', error.message);
    process.exit(1);
  }

  console.log('✅ All migration locks cleared!\n');
  
  // Verify
  const { data: remaining } = await supabase
    .from('migration_control')
    .select('*');

  console.log('📊 Remaining locks:', remaining?.length || 0);
  if (remaining && remaining.length > 0) {
    remaining.forEach(m => {
      console.log(`   ⚠️  ${m.migration_month}: is_completed=${m.is_completed}`);
    });
  }

} catch (error) {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
}

process.exit(0);
