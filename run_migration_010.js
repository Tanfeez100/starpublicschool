import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function displayMigration() {
  console.log('🔄 PostgreSQL Function Migration Required\n');
  
  const sql = fs.readFileSync('./migrations/010_create_migration_function.sql', 'utf-8');
  
  console.log('📋 SQL MIGRATION:\n');
  console.log(sql);
  console.log('\n' + '='.repeat(70) + '\n');
  
  console.log('📍 HOW TO EXECUTE:\n');
  console.log('1. Go to https://app.supabase.com');
  console.log('2. Select your project: ygeofofbsnoytuoffbah');
  console.log('3. Navigate to: SQL Editor');
  console.log('4. Click "New Query"');
  console.log('5. Copy and paste the SQL migration above');
  console.log('6. Click "RUN"\n');
  
  console.log('⚠️  IMPORTANT: This function must be created BEFORE running migrations!\n');
  console.log('What this function does:');
  console.log('   ✓ Inserts pending due amounts into previous_dues table');
  console.log('   ✓ Inserts advance amounts into advance_ledger table');
  console.log('   ✓ Returns amounts inserted for logging\n');

  process.exit(0);
}

displayMigration();
