import XLSX from 'xlsx';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const API_BASE_URL = process.env.API_URL || 'http://localhost:5000';
const MIGRATION_MONTH = '2026-03'; // Change this to your migration month

/**
 * Read Excel file and extract all student data from all sheets
 * @param {string} filePath - Path to Excel file
 * @returns {Object} - Grouped by class and section
 */
function readExcelFile(filePath) {
  console.log(`\n📖 Reading Excel file: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`❌ File not found: ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath);
  const studentsByClassSection = {};

  console.log(`\n📋 Found ${workbook.SheetNames.length} sheet(s):\n`);

  workbook.SheetNames.forEach((sheetName, index) => {
    console.log(`  ${index + 1}. ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Group by class and section
    data.forEach((row) => {
      const className = String(row.class).trim();
      const section = String(row.section).trim();
      const rollNo = parseInt(row.roll_no);
      const pendingDue = parseFloat(row.pending_due) || 0;
      const advance = parseFloat(row.advance) || 0;

      if (!className || !section || !rollNo) {
        console.warn(`⚠️  Skipping row with missing data:`, row);
        return;
      }

      const key = `${className}_${section}`;
      if (!studentsByClassSection[key]) {
        studentsByClassSection[key] = {
          class: className,
          section: section,
          students: []
        };
      }

      studentsByClassSection[key].students.push({
        roll_no: rollNo,
        pending_due: pendingDue,
        advance: advance
      });
    });
  });

  return studentsByClassSection;
}

/**
 * Call migration API for each class/section combination
 * @param {Object} studentsByClassSection - Grouped student data
 */
async function migrateAllClasses(studentsByClassSection) {
  const classKeys = Object.keys(studentsByClassSection);
  
  if (classKeys.length === 0) {
    console.error('\n❌ No data found in Excel file');
    return;
  }

  console.log(`\n\n🚀 Starting migration for ${classKeys.length} class/section combination(s)...\n`);

  let totalMigrated = 0;
  let totalFailed = 0;
  const results = [];

  for (const key of classKeys) {
    const { class: className, section, students } = studentsByClassSection[key];
    
    console.log(`\n📤 Migrating Class ${className}, Section ${section}...`);
    console.log(`   Students: ${students.length}`);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/migration/opening-balance`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            migration_month: MIGRATION_MONTH,
            class: className,
            section: section,
            students: students
          })
        }
      );

      const responseData = await response.json();

      if (response.ok) {
        console.log(`   ✅ Success: ${responseData.migrated || students.length} students migrated`);
        totalMigrated += responseData.migrated || students.length;
        results.push({
          class: className,
          section: section,
          status: 'SUCCESS',
          migrated: responseData.migrated || students.length,
          message: responseData.message
        });
      } else {
        console.error(`   ❌ Failed: ${responseData.error || response.statusText}`);
        totalFailed += students.length;
        results.push({
          class: className,
          section: section,
          status: 'FAILED',
          message: responseData.error || response.statusText
        });
      }
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      totalFailed += students.length;
      results.push({
        class: className,
        section: section,
        status: 'ERROR',
        message: error.message
      });
    }
  }

  // Summary
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('📊 MIGRATION SUMMARY');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Total Migrated: ${totalMigrated}`);
  console.log(`❌ Total Failed: ${totalFailed}`);
  console.log(`\nDetailed Results:`);
  results.forEach(result => {
    const icon = result.status === 'SUCCESS' ? '✅' : '❌';
    console.log(`\n${icon} Class ${result.class}, Section ${result.section}`);
    console.log(`   Status: ${result.status}`);
    if (result.migrated) {
      console.log(`   Migrated: ${result.migrated}`);
    }
    if (result.message) {
      console.log(`   Message: ${result.message}`);
    }
  });
  console.log(`\n${'='.repeat(60)}\n`);
}

/**
 * Main execution
 */
async function main() {
  try {
    // Get file path from command line or use default
    const filePath = process.argv[2] || './student_data.xlsx';
    
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║       BATCH MIGRATION FROM EXCEL - ALL CLASSES        ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    // Read Excel file
    const studentsByClassSection = readExcelFile(filePath);

    // Migrate all classes
    await migrateAllClasses(studentsByClassSection);

    console.log('✨ Migration process completed!');
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Fatal Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
