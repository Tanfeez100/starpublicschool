import dotenv from 'dotenv';
dotenv.config();

import { supabase } from './src/services/supabase.js';

console.log('\n=== DATABASE STATE CHECK ===\n');

try {
  // Check migration control
  const { data: migrationsLocked, error: migError } = await supabase
    .from('migration_control')
    .select('*');

  console.log('1️⃣ MIGRATION LOCKS:');
  if (migError) {
    console.log('   ❌ Error:', migError.message);
  } else if (migrationsLocked && migrationsLocked.length > 0) {
    console.log('   ⚠️  LOCKED MIGRATIONS:');
    migrationsLocked.forEach(m => {
      console.log(`      - ${m.migration_month}: is_completed=${m.is_completed}`);
    });
  } else {
    console.log('   ✅ No locks - migration is free');
  }

  // Check students
  const { data: students, error: studError } = await supabase
    .from('students')
    .select('id, roll_no, name, class, section', { count: 'exact' });

  console.log('\n2️⃣ STUDENTS:');
  if (studError) {
    console.log('   ❌ Error:', studError.message);
  } else {
    console.log(`   📊 Total: ${students?.length || 0} students`);
  }

  // Check classes  
  const { data: classes, error: classError } = await supabase
    .from('class_subjects')
    .select('class, section')
    .distinct();

  console.log('\n3️⃣ CLASSES/SECTIONS:');
  if (classError) {
    console.log('   ❌ Error:', classError.message);
  } else {
    console.log(`   📊 Total: ${classes?.length || 0} class-section combinations`);
    if (classes && classes.length > 0) {
      classes.slice(0, 5).forEach(c => {
        console.log(`      - Class ${c.class}, Section ${c.section}`);
      });
    }
  }

  // Check fee bills
  const { data: bills, error: billError } = await supabase
    .from('fee_bills')
    .select('id, student_id', { count: 'exact' });

  console.log('\n4️⃣ FEE BILLS:');
  if (billError) {
    console.log('   ❌ Error:', billError.message);
  } else {
    console.log(`   📊 Total: ${bills?.length || 0} bills`);
  }

  console.log('\n' + '='.repeat(40) + '\n');

  // Summary
  if (migrationsLocked && migrationsLocked.length > 0) {
    console.log('🔴 ISSUE: Migration lock exists!');
    console.log('   Solution: Call cancel migration API or run:');
    console.log('   POST /api/migration/cancel');
    console.log('   Body: { "migration_month": "' + migrationsLocked[0].migration_month + '" }');
  }

  if (!students || students.length === 0) {
    console.log('🔴 ISSUE: No students in database!');
    console.log('   Solution: Seed students data first');
  }

} catch (error) {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
}

process.exit(0);
