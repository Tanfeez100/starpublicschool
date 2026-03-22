import { supabase } from './src/services/supabase.js';

console.log('Checking database state...\n');

// Check migration control
const { data: migrationsLocked } = await supabase
  .from('migration_control')
  .select('*');

console.log('1. Migration Control Table:');
console.log(migrationsLocked || 'No locks');

// Check students
const { data: students } = await supabase
  .from('students')
  .select('id, roll_no, name, class, section')
  .limit(5);

console.log('\n2. Students (first 5):');
console.log(students?.length || 0, 'students found');

// Check classes  
const { data: classes } = await supabase
  .from('class_subjects')
  .select('class, section')
  .distinct();

console.log('\n3. Classes:');
console.log(classes?.length || 0, 'class-section combinations');

// Check fee bills
const { data: bills } = await supabase
  .from('fee_bills')
  .select('id, student_id')
  .limit(5);

console.log('\n4. Fee Bills:');
console.log(bills?.length || 0, 'bills found');

process.exit(0);
