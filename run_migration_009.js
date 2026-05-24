import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  console.log('🔄 Creating migration_logs table in Supabase...\n');
  
  const sql = fs.readFileSync('./migrations/009_create_migration_logs_table.sql', 'utf-8');
  
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
  
  console.log('⚠️  IMPORTANT: The migration_logs table must be created before running new migrations!\n');

  process.exit(0);
}

runMigration();
