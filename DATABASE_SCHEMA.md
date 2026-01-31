# School Management - Optimized Database Schema

## New Marks System Architecture

### Overview
- **Normalized design** to eliminate duplication
- **Flexible subject mapping** per class
- **External + Internal marks** separation
- **Professional structure** for future scalability

---

## Tables

### 1. `subjects` (Master Subject List)
```sql
CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL UNIQUE,
  code VARCHAR(10) NOT NULL UNIQUE,
  max_external_marks INT DEFAULT 80,
  max_internal_marks INT DEFAULT 20,
  created_at TIMESTAMP DEFAULT now()
);
```

**Example Data:**
| code | name | max_external | max_internal |
|------|------|--------------|--------------|
| HND | Hindi | 80 | 20 |
| HNW | Hindi Writing | 80 | 20 |
| ENG | English | 80 | 20 |
| ENW | English Writing | 80 | 20 |
| MTH | Math | 80 | 20 |
| DRW | Drawing | 50 | 0 |
| EVS | EVS | 80 | 20 |
| GK | GK | 80 | 20 |
| SNS | Sanskrit/Urdu | 80 | 20 |
| COM | Computer | 80 | 20 |
| SCI | Science | 80 | 20 |
| SST | SST | 80 | 20 |

---

### 2. `class_subjects` (Curriculum Mapping)
```sql
CREATE TABLE class_subjects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class VARCHAR(20) NOT NULL,
  subject_id UUID NOT NULL,
  sequence INT,
  created_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (subject_id) REFERENCES subjects(id),
  UNIQUE(class, subject_id)
);
```

**Example:** Class "UKG" has Hindi, English, Math, EVS, GK, Drawing

---

### 3. `marks` (Student Marks - Normalized)
```sql
CREATE TABLE marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  terminal VARCHAR(20) NOT NULL, -- "First", "Second", "Annual"
  external_marks DECIMAL(5,2),
  internal_marks DECIMAL(5,2),
  status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, SUBMITTED, LOCKED
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id),
  UNIQUE(student_id, subject_id, terminal)
);
```

**Indexes for Performance:**
```sql
CREATE INDEX idx_marks_student ON marks(student_id);
CREATE INDEX idx_marks_terminal ON marks(terminal);
CREATE INDEX idx_marks_student_terminal ON marks(student_id, terminal);
```

---

### 4. `result_summary` (Cached Results - Optional)
```sql
CREATE TABLE result_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL,
  terminal VARCHAR(20) NOT NULL,
  total_marks DECIMAL(7,2),
  total_obtained DECIMAL(7,2),
  percentage DECIMAL(5,2),
  division VARCHAR(20),
  status VARCHAR(20),
  calculated_at TIMESTAMP DEFAULT now(),
  
  FOREIGN KEY (student_id) REFERENCES students(id),
  UNIQUE(student_id, terminal)
);
```

---

## Class-Subject Mapping

### M.C to LKG
- Hindi, Hindi Writing, English, English Writing, Math, Drawing

### UKG
- Hindi, English, Math, EVS, GK, Drawing

### Classes 1-5
- Hindi, English, Math, EVS, Sanskrit/Urdu, Computer, GK, Drawing

### Classes 6-8
- Hindi, English, Science, Math, SST, GK, Computer, Sanskrit/Urdu, Drawing

---

## Marks Calculation Formula

### Total Marks per Subject:
- **Normal Subjects:** External (80) + Internal (20) = **100**
- **Drawing:** External (50) + Internal (0) = **50**

### Result Summary:
```
total_marks = SUM(max_external + max_internal) for all subjects in class
total_obtained = SUM(external + internal) for all subjects
percentage = (total_obtained / total_marks) * 100
division = 
  >= 60% → First
  >= 45% → Second
  >= 33% → Third
  < 33% → Fail
```

---

## Migration Steps

1. Create `subjects` table with all subjects
2. Create `class_subjects` table with class-subject mappings
3. Create new `marks` table structure
4. Migrate existing marks data
5. Create views for backwards compatibility (optional)

---

## Benefits

✅ **Normalized:** No subject duplication
✅ **Flexible:** Easy to add/modify subjects and class mappings
✅ **Scalable:** Supports marking external/internal separately
✅ **Efficient:** Indexed for fast queries
✅ **Maintainable:** Clear separation of concerns
✅ **Professional:** Industry-standard design

