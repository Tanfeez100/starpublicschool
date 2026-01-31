# Implementation Guide - New Marks System

## Overview
This guide explains how to migrate from the old marks system to the new normalized, professional schema.

---

## Step 1: Database Migration

### 1.1 Run Migrations in Supabase

1. Go to **Supabase Dashboard** → Your Project
2. Navigate to **SQL Editor**
3. Run migration files in order:
   - **First:** `migrations/001_create_subjects_table.sql`
   - **Second:** `migrations/002_seed_subjects_and_curriculum.sql`

### 1.2 Verify Tables Created

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables WHERE table_schema='public';

-- Check subjects
SELECT * FROM subjects LIMIT 5;

-- Check class subjects
SELECT * FROM class_subjects LIMIT 5;

-- Check marks structure
SELECT * FROM marks LIMIT 0;
```

---

## Step 2: Data Migration (Old → New)

### 2.1 Backup Old Data
```sql
-- Before deleting, backup old marks
CREATE TABLE marks_old_backup AS SELECT * FROM marks;
```

### 2.2 Migrate Existing Marks

If you have existing marks in the old schema:

```javascript
// Migration script - run once
import { supabase } from "./services/supabase.js";

export const migrateMarksData = async () => {
  // Get all old marks records
  const { data: oldMarks } = await supabase
    .from("marks_old_backup")
    .select("*");

  if (!oldMarks) return;

  // Get subject mappings
  const { data: subjects } = await supabase.from("subjects").select("*");
  const subjectMap = {};
  subjects.forEach((s) => {
    subjectMap[s.code] = s.id;
  });

  // Transform old marks to new format
  const newMarks = oldMarks.flatMap((oldRecord) => {
    const subject_codes = [
      "hindi",
      "english",
      "math",
      "evs",
      "gk",
      "drawing",
      "science",
      "sst",
      "computer",
    ];

    return subject_codes.map((code) => {
      const value = oldRecord[code];
      return {
        student_id: oldRecord.student_id,
        subject_id: subjectMap[code.toUpperCase()],
        terminal: oldRecord.terminal,
        external_marks: value ? value : null,
        internal_marks: null, // Set later or import if available
        status: "PENDING",
      };
    });
  });

  // Insert new marks
  const { error } = await supabase
    .from("marks")
    .insert(newMarks);

  if (error) {
    console.error("Migration error:", error);
    throw error;
  }

  console.log(`Migrated ${newMarks.length} marks records`);
};
```

---

## Step 3: Update Application Code

### 3.1 Replace Routes
```javascript
// In src/server.js or src/app.js

// OLD
// import marksRoutes from "./routes/marks.routes.js";

// NEW
import marksRoutes from "./routes/marks.routes.new.js";
app.use("/api/marks", marksRoutes);
```

### 3.2 Replace Controller
```javascript
// In imports, use the new controller
// import { ... } from "../controllers/marks.controller.js";
// NEW
import { ... } from "../controllers/marks.controller.new.js";
```

### 3.3 Use Helper Utilities
```javascript
import {
  getClassCurriculum,
  calculateResultSummary,
  formatMarksResponse,
  validateMarks,
} from "../utils/marksHelper.js";
```

---

## Step 4: API Endpoints

### 4.1 Get Class Subjects
```bash
GET /api/marks/class/UKG
```

**Response:**
```json
{
  "class": "UKG",
  "subjects": [
    {
      "id": "uuid",
      "name": "Hindi",
      "code": "HND",
      "max_external_marks": 80,
      "max_internal_marks": 20
    },
    {
      "id": "uuid",
      "name": "Drawing",
      "code": "DRW",
      "max_external_marks": 50,
      "max_internal_marks": 0
    }
  ]
}
```

### 4.2 Submit Marks
```bash
POST /api/marks/submit
```

**Body:**
```json
{
  "student_id": "uuid-of-student",
  "terminal": "First",
  "marksArray": [
    {
      "subject_id": "uuid-hindi",
      "external_marks": 75,
      "internal_marks": 18
    },
    {
      "subject_id": "uuid-math",
      "external_marks": 82,
      "internal_marks": 19
    },
    {
      "subject_id": "uuid-drawing",
      "external_marks": 45,
      "internal_marks": 0
    }
  ]
}
```

**Response:**
```json
{
  "message": "Marks submitted successfully",
  "student_id": "uuid",
  "terminal": "First",
  "count": 6
}
```

### 4.3 Get Student Result (Before Publishing)
```bash
GET /api/marks/result?class=UKG&roll=5&terminal=First
```

**Response:**
```json
{
  "student": {
    "id": "uuid",
    "name": "Ahsan Ahmed",
    "class": "UKG",
    "roll_no": 5,
    "section": "A"
  },
  "terminal": "First",
  "marks": [
    {
      "subject": "Hindi",
      "code": "HND",
      "max_marks": 100,
      "external_marks": 75,
      "internal_marks": 18,
      "total_obtained": 93
    },
    {
      "subject": "Drawing",
      "code": "DRW",
      "max_marks": 50,
      "external_marks": 45,
      "internal_marks": "AB",
      "total_obtained": 45
    }
  ],
  "summary": {
    "total_max_marks": 550,
    "total_obtained": 510,
    "percentage": 92.73,
    "division": "First",
    "status": "Published"
  }
}
```

### 4.4 Publish Result
```bash
POST /api/marks/publish
```

**Body:**
```json
{
  "student_id": "uuid",
  "terminal": "First"
}
```

**Response:**
```json
{
  "message": "Result published successfully",
  "student": {
    "id": "uuid",
    "name": "Ahsan Ahmed",
    "class": "UKG"
  },
  "result": {
    "terminal": "First",
    "total_marks": 550,
    "total_obtained": 510,
    "percentage": 92.73,
    "division": "First"
  }
}
```

### 4.5 Get Published Result
```bash
GET /api/marks/result/published?student_id=uuid&terminal=First
```

---

## Step 5: Testing Workflow

### Test Data
```bash
# 1. Get UKG subjects
curl http://localhost:5000/api/marks/class/UKG

# 2. Get a student (find student_id first)
# Use the students API to find student by class & roll

# 3. Submit marks for that student
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "...",
    "terminal": "First",
    "marksArray": [...]
  }'

# 4. Verify with get result endpoint
curl 'http://localhost:5000/api/marks/result?class=UKG&roll=5&terminal=First'

# 5. Publish result
curl -X POST http://localhost:5000/api/marks/publish \
  -H "Content-Type: application/json" \
  -d '{"student_id": "...", "terminal": "First"}'
```

---

## Step 6: Class & Subject Mapping Reference

```
Mother Care  → Hindi, Hindi Writing, English, English Writing, Math, Drawing
Nursery      → Hindi, Hindi Writing, English, English Writing, Math, Drawing
LKG          → Hindi, Hindi Writing, English, English Writing, Math, Drawing
UKG          → Hindi, English, Math, EVS, GK, Drawing
1-5          → Hindi, English, Math, EVS, Sanskrit, Computer, GK, Drawing
6-8          → Hindi, English, Science, Math, SST, GK, Computer, Sanskrit, Drawing
```

---

## Step 7: Key Features of New System

✅ **Normalized Schema** - No data duplication  
✅ **Flexible** - Easy to add/modify subjects  
✅ **External + Internal Marks** - Separate tracking  
✅ **Drawing = 50 marks** - Special handling  
✅ **Result Publishing** - Lock marks, calculate, cache  
✅ **Efficient Queries** - Indexed tables  
✅ **Scalable** - Ready for future features  

---

## Troubleshooting

### "Subject not found" error
- Verify subjects table is populated
- Check `migrations/002_seed_subjects_and_curriculum.sql` was run

### "No subjects found for class"
- Verify class_subjects mappings
- Check class name matches exactly (case-sensitive)

### "Marks validation failed"
- Verify external_marks ≤ max_external_marks
- Verify internal_marks ≤ max_internal_marks
- Drawing should have internal_marks = 0 or null

### Migration Issues
- Ensure backup created first
- Run migrations in correct order
- Check Supabase SQL Editor for errors

---

## Rollback Plan

If you need to revert:

```sql
-- Restore from backup
DROP TABLE marks;
ALTER TABLE marks_old_backup RENAME TO marks;

-- OR keep old and new parallel
-- Old: marks_old_backup
-- New: marks
```

