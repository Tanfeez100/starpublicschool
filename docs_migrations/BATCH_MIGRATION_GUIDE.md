# Batch Migration from Excel ✨

## Overview
This script reads **all sheets** from your Excel file and migrates ALL students from ALL classes/sections in **one batch operation**.

## Prerequisites
1. ✅ Excel file with multiple sheets (one per class/section) or all data in one sheet
2. ✅ Columns: `class`, `roll_no`, `section`, `pending_due`, `advance`
3. ✅ All SQL migrations executed in Supabase (migrations 009, 010, 011)
4. ✅ Backend server running

## Excel File Format

**File structure:** Multiple sheets OR single sheet

### Sheet Names (if multiple sheets):
- `8_A` or `Class 8 Section A` (any naming - script extracts class & section from data)
- `8_B`
- `9_A`, etc.

### Columns (required):
```
| class | roll_no | section | pending_due | advance |
|-------|---------|---------|-------------|---------|
| 8     | 1       | A       | 600         | 0       |
| 8     | 12      | A       | 700         | 0       |
| 8     | 5       | B       | 1900        | 0       |
```

## Step-by-Step

### 1. **Upload Excel File**
   - Place your Excel file in the project root: `c:\GPS-BACKEND\student_data.xlsx`
   - OR use any filename (you'll pass it as argument)

### 2. **Verify Backend is Running**
   ```bash
   npm run dev
   ```
   Should see: `✅ Server running on port 5000`

### 3. **Run Batch Migration**

**Option A: Default file naming**
```bash
node batch_migrate_from_excel.js
```
(Looks for `./student_data.xlsx`)

**Option B: Custom filename**
```bash
node batch_migrate_from_excel.js ./path/to/your/file.xlsx
```

### 4. **Custom Migration Month**
Edit the script and change:
```javascript
const MIGRATION_MONTH = '2026-03'; // Change to your month
```

## Expected Output

```
╔════════════════════════════════════════════════════════╗
║       BATCH MIGRATION FROM EXCEL - ALL CLASSES        ║
╚════════════════════════════════════════════════════════╝

📖 Reading Excel file: ./student_data.xlsx

📋 Found 4 sheet(s):
  1. Class 8A
  2. Class 8B
  3. Class 9A
  4. Class 9B

🚀 Starting migration for 4 class/section combination(s)...

📤 Migrating Class 8, Section A...
   Students: 8
   ✅ Success: 8 students migrated

📤 Migrating Class 8, Section B...
   Students: 2
   ✅ Success: 2 students migrated

[...]

============================================================
📊 MIGRATION SUMMARY
============================================================
✅ Total Migrated: 50
❌ Total Failed: 0

============================================================
```

## What the Script Does

1. ✅ Reads all sheets from Excel
2. ✅ Extracts: `class`, `section`, `roll_no`, `pending_due`, `advance`
3. ✅ Groups students by Class + Section
4. ✅ Calls API for each class/section once with ALL students
5. ✅ Shows summary of migrated vs failed

## Troubleshooting

### File Not Found
```
❌ File not found: ./student_data.xlsx
```
- Check file location
- Use full path: `node batch_migrate_from_excel.js c:\path\to\file.xlsx`

### Connection Error
```
❌ Error: fetch failed
```
- Check if backend is running: `npm run dev`
- Verify API URL in script (default: http://localhost:5000)
- Check `.env` file for API_URL

### Column Not Found
```
⚠️  Skipping row with missing data
```
- Verify column names match exactly: `class`, `roll_no`, `section`, `pending_due`, `advance`
- Check for typos or extra spaces

### API Returns 409 Conflict
- Migration lock exists (another migration running)
- Clear locks: `node clear_migration_locks.js`
- Retry: `node batch_migrate_from_excel.js`

## Questions?
- Double-check Excel column names (must match exactly)
- Ensure pending_due contains numeric values
- Verify section values match database (e.g., "A", "B", not "Section A")
