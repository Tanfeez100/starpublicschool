# Database Schema Diagram

## Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      students                               │
├─────────────────────────────────────────────────────────────┤
│ id (UUID) PK                                                │
│ name                                                        │
│ class                                                       │
│ roll_no                                                     │
│ father_name                                                 │
│ section                                                     │
│ created_at                                                  │
└────────────────────────┬────────────────────────────────────┘
                         │ (has many)
                         │
                         ├──────────────────────────────────────┐
                         │                                      │
            ┌────────────▼──────────────┐       ┌──────────────▼─────────────┐
            │        marks              │       │   result_summary            │
            ├───────────────────────────┤       ├─────────────────────────────┤
            │ id (UUID) PK              │       │ id (UUID) PK                │
            │ student_id FK ────────────┼──────→│ student_id FK ──────────┐   │
            │ subject_id FK ──┐         │       │ terminal                │   │
            │ terminal        │         │       │ total_marks             │   │
            │ external_marks  │         │       │ total_obtained          │   │
            │ internal_marks  │         │       │ percentage              │   │
            │ status          │         │       │ division                │   │
            │ created_at      │         │       │ status                  │   │
            │ updated_at      │         │       │ calculated_at           │   │
            └────────┬─────────┘         │       └────────────────────────┘   │
                     │                   │                    ▲                │
                     │ (has)             │                    └────────────────┘
                     │                   │
                     └──────────┬────────┘
                                │
            ┌───────────────────▼──────────────────┐
            │        subjects                      │
            ├────────────────────────────────────┤
            │ id (UUID) PK                       │
            │ name                               │
            │ code (UNIQUE)                      │
            │ max_external_marks (default: 80)   │
            │ max_internal_marks (default: 20)   │
            │ created_at                         │
            │ updated_at                         │
            └────────────────┬────────────────────┘
                             │ (many-to-many)
                             │
            ┌────────────────▼──────────────────┐
            │     class_subjects                 │
            ├────────────────────────────────────┤
            │ id (UUID) PK                       │
            │ class                              │
            │ subject_id FK ───────┐             │
            │ sequence             │             │
            │ created_at           │             │
            │ UNIQUE(class, subject_id)          │
            └──────────────────────┘             │
                                                 │
                                    ┌────────────┘
                                    │
                    ┌───────────────┴──────────────┐
                    │ Connects classes to subjects  │
                    │ E.g., UKG has these subjects  │
                    └──────────────────────────────┘
```

---

## Entity Relationship Model (ERM)

```
STUDENTS (1) ─────────────► (M) MARKS
  │ id
  ├─ name
  ├─ class
  ├─ roll_no
  └─ father_name
  
                    MARKS (M) ─────────┬─────► (1) SUBJECTS
                      │ id             │         │ id
                      ├─ student_id───→│         ├─ name
                      ├─ subject_id───┐│         ├─ code
                      ├─ terminal      ││         ├─ max_external_marks
                      ├─ external_marks││         └─ max_internal_marks
                      ├─ internal_marks││
                      └─ status        │└──────→ class_subjects maps
                                       │         CLASS to SUBJECTS
                                       │
                            RESULT_SUMMARY (cached summary)
                              │ id
                              ├─ student_id ─────┐
                              ├─ terminal        │
                              ├─ total_marks    │
                              ├─ total_obtained └──► Calculated from MARKS
                              ├─ percentage        
                              └─ division
```

---

## Schema Evolution

### FROM (Old De-normalized)
```sql
CREATE TABLE marks (
  id UUID PRIMARY KEY,
  student_id UUID,
  terminal VARCHAR,
  hindi INT,           -- ❌ Hard-coded columns
  english INT,         -- ❌ Can't add subjects easily
  math INT,
  urdu_sanskrit INT,
  science INT,
  sst INT,
  gk INT,
  drawing INT,         -- ❌ Mixed with other subjects
  created_at TIMESTAMP
);
```

**Issues:**
- Need to modify table structure to add subjects
- No external/internal separation
- Drawing treated same as other subjects
- Duplication across classes

### TO (New Normalized)
```sql
-- Master subject list (flexible)
CREATE TABLE subjects (
  id UUID PRIMARY KEY,
  name VARCHAR UNIQUE,
  code VARCHAR UNIQUE,
  max_external_marks INT DEFAULT 80,
  max_internal_marks INT DEFAULT 20
);

-- Curriculum mapping (flexible per class)
CREATE TABLE class_subjects (
  id UUID PRIMARY KEY,
  class VARCHAR,
  subject_id UUID REFERENCES subjects(id),
  sequence INT,
  UNIQUE(class, subject_id)
);

-- Normalized marks (one row per subject per terminal)
CREATE TABLE marks (
  id UUID PRIMARY KEY,
  student_id UUID REFERENCES students(id),
  subject_id UUID REFERENCES subjects(id),
  terminal VARCHAR,
  external_marks DECIMAL(5,2),    -- ✅ Separated
  internal_marks DECIMAL(5,2),    -- ✅ Separated
  status VARCHAR DEFAULT 'PENDING',
  UNIQUE(student_id, subject_id, terminal)
);

-- Cached summary (fast retrieval)
CREATE TABLE result_summary (
  student_id UUID REFERENCES students(id),
  terminal VARCHAR,
  total_marks DECIMAL,
  total_obtained DECIMAL,
  percentage DECIMAL,
  division VARCHAR
);
```

**Benefits:**
✅ Add subjects without modifying structure
✅ Flexible marks (external + internal)
✅ Dynamic class-subject mapping
✅ No duplication
✅ Better query performance

---

## Data Example

### subjects table
```
id                    | name              | code | max_ext | max_int
──────────────────────┼──────────────────┼──────┼─────────┼────────
8fb-a78e-4f2a-b456   | Hindi             | HND  | 80      | 20
9fb-a78e-4f2a-b457   | English           | ENG  | 80      | 20
afb-a78e-4f2a-b458   | Math              | MTH  | 80      | 20
bfb-a78e-4f2a-b459   | Drawing           | DRW  | 50      | 0
cfb-a78e-4f2a-b460   | EVS               | EVS  | 80      | 20
```

### class_subjects table
```
id                  | class | subject_id              | sequence
────────────────────┼───────┼────────────────────────┼──────────
1fb-a78e-4f2a     | UKG   | 8fb-a78e-4f2a-b456    | 1
2fb-a78e-4f2a     | UKG   | 9fb-a78e-4f2a-b457    | 2
3fb-a78e-4f2a     | UKG   | afb-a78e-4f2a-b458    | 3
4fb-a78e-4f2a     | UKG   | cfb-a78e-4f2a-b460    | 4
5fb-a78e-4f2a     | UKG   | bfb-a78e-4f2a-b459    | 5
───
6fb-a78e-4f2a     | 1     | 8fb-a78e-4f2a-b456    | 1
7fb-a78e-4f2a     | 1     | 9fb-a78e-4f2a-b457    | 2
...
```

### marks table
```
id                 | student_id              | subject_id              | terminal | external | internal | status
───────────────────┼────────────────────────┼────────────────────────┼──────────┼──────────┼──────────┼─────────
m-1-uuid          | 550e8400-e29b-41d4    | 8fb-a78e-4f2a-b456    | First    | 75       | 18       | LOCKED
m-2-uuid          | 550e8400-e29b-41d4    | 9fb-a78e-4f2a-b457    | First    | 82       | 19       | LOCKED
m-3-uuid          | 550e8400-e29b-41d4    | afb-a78e-4f2a-b458    | First    | 88       | 20       | LOCKED
m-4-uuid          | 550e8400-e29b-41d4    | bfb-a78e-4f2a-b459    | First    | 45       | 0        | LOCKED
m-5-uuid          | 550e8400-e29b-41d4    | cfb-a78e-4f2a-b460    | First    | 70       | 16       | LOCKED
```

### result_summary table
```
student_id                | terminal | total_marks | total_obtained | percentage | division
─────────────────────────┼──────────┼─────────────┼────────────────┼────────────┼──────────
550e8400-e29b-41d4      | First    | 450         | 410            | 91.11      | First
```

---

## Indexes for Performance

```sql
-- Fast lookup by student + terminal
CREATE INDEX idx_marks_student_terminal ON marks(student_id, terminal);

-- Fast lookup by class
CREATE INDEX idx_class_subjects_class ON class_subjects(class);

-- Fast result lookup
CREATE INDEX idx_result_summary_student ON result_summary(student_id);
```

---

## Key Points

### One Row Per Subject Per Terminal
Each student has ONE row per subject per terminal
- Student A, Hindi, First → 1 row (external + internal)
- Student A, Hindi, Second → 1 row (external + internal)
- Student A, English, First → 1 row (external + internal)

### Drawing Is Special
- max_external_marks = 50
- max_internal_marks = 0
- System respects these limits

### Classes Map to Subjects Dynamically
```
class_subjects allows:
- UKG → {Hindi, English, Math, EVS, GK, Drawing}
- 1-5 → {Hindi, English, Math, EVS, Sanskrit, Computer, GK, Drawing}
- 6-8 → {Hindi, English, Science, Math, SST, GK, Computer, Sanskrit, Drawing}
```

### Result Summary Is Cached
- Not recalculated every time
- Updated when result is published
- Fast queries for viewing results

---

## Constraints & Validation

```
subjects.code → UNIQUE
subjects.name → UNIQUE
class_subjects → UNIQUE(class, subject_id)
marks → UNIQUE(student_id, subject_id, terminal)
result_summary → UNIQUE(student_id, terminal)

Foreign Keys:
- marks.student_id → students.id
- marks.subject_id → subjects.id
- class_subjects.subject_id → subjects.id
- result_summary.student_id → students.id
```

