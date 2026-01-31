# Real-World Examples & Workflows

## Example 1: Complete UKG Class Marking & Publishing

### Scenario
Admin wants to submit marks for UKG class (Terminal: First) and publish results.

### Step 1: Get UKG Subjects
```bash
curl http://localhost:5000/api/marks/class/UKG
```

**Response:**
```json
{
  "class": "UKG",
  "subjects": [
    {
      "id": "8fb-a78e-4f2a-b456",
      "name": "Hindi",
      "code": "HND",
      "max_external_marks": 80,
      "max_internal_marks": 20
    },
    {
      "id": "9fb-a78e-4f2a-b457",
      "name": "English",
      "code": "ENG",
      "max_external_marks": 80,
      "max_internal_marks": 20
    },
    {
      "id": "afb-a78e-4f2a-b458",
      "name": "Math",
      "code": "MTH",
      "max_external_marks": 80,
      "max_internal_marks": 20
    },
    {
      "id": "bfb-a78e-4f2a-b459",
      "name": "EVS",
      "code": "EVS",
      "max_external_marks": 80,
      "max_internal_marks": 20
    },
    {
      "id": "cfb-a78e-4f2a-b460",
      "name": "General Knowledge",
      "code": "GK",
      "max_external_marks": 80,
      "max_internal_marks": 20
    },
    {
      "id": "dfb-a78e-4f2a-b461",
      "name": "Drawing",
      "code": "DRW",
      "max_external_marks": 50,
      "max_internal_marks": 0
    }
  ]
}
```

### Step 2: Find Student
```bash
curl 'http://localhost:5000/api/students/find?class=UKG&roll=5'
```

**Response:**
```json
{
  "student": {
    "id": "550e8400-e29b-41d4-a716-446655440005",
    "name": "Ahsan Ahmed",
    "class": "UKG",
    "roll_no": 5,
    "father_name": "Ahmed Ali",
    "section": "A"
  }
}
```

### Step 3: Submit Marks
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "550e8400-e29b-41d4-a716-446655440005",
    "terminal": "First",
    "marksArray": [
      {
        "subject_id": "8fb-a78e-4f2a-b456",
        "external_marks": 75,
        "internal_marks": 18
      },
      {
        "subject_id": "9fb-a78e-4f2a-b457",
        "external_marks": 82,
        "internal_marks": 19
      },
      {
        "subject_id": "afb-a78e-4f2a-b458",
        "external_marks": 88,
        "internal_marks": 20
      },
      {
        "subject_id": "bfb-a78e-4f2a-b459",
        "external_marks": 76,
        "internal_marks": 16
      },
      {
        "subject_id": "cfb-a78e-4f2a-b460",
        "external_marks": 70,
        "internal_marks": 14
      },
      {
        "subject_id": "dfb-a78e-4f2a-b461",
        "external_marks": 45,
        "internal_marks": 0
      }
    ]
  }'
```

**Response:**
```json
{
  "message": "Marks submitted successfully",
  "student_id": "550e8400-e29b-41d4-a716-446655440005",
  "terminal": "First",
  "count": 6
}
```

### Step 4: Preview Result (Before Publishing)
```bash
curl 'http://localhost:5000/api/marks/result?class=UKG&roll=5&terminal=First'
```

**Response:**
```json
{
  "student": {
    "id": "550e8400-e29b-41d4-a716-446655440005",
    "name": "Ahsan Ahmed",
    "father_name": "Ahmed Ali",
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
      "subject": "English",
      "code": "ENG",
      "max_marks": 100,
      "external_marks": 82,
      "internal_marks": 19,
      "total_obtained": 101
    },
    {
      "subject": "Math",
      "code": "MTH",
      "max_marks": 100,
      "external_marks": 88,
      "internal_marks": 20,
      "total_obtained": 108
    },
    {
      "subject": "EVS",
      "code": "EVS",
      "max_marks": 100,
      "external_marks": 76,
      "internal_marks": 16,
      "total_obtained": 92
    },
    {
      "subject": "General Knowledge",
      "code": "GK",
      "max_marks": 100,
      "external_marks": 70,
      "internal_marks": 14,
      "total_obtained": 84
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
    "total_obtained": 523,
    "percentage": 95.09,
    "division": "First",
    "status": "Published"
  }
}
```

**Calculation:**
- Hindi: 75 + 18 = 93/100
- English: 82 + 19 = 101/100 ⚠️ (Over, but system accepts)
- Math: 88 + 20 = 108/100 ⚠️ (Over, but system accepts)
- EVS: 76 + 16 = 92/100
- GK: 70 + 14 = 84/100
- Drawing: 45 + 0 = 45/50
- **Total: 523/550 = 95.09% → First Division** ✓

### Step 5: Publish Result (Lock Marks)
```bash
curl -X POST http://localhost:5000/api/marks/publish \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "550e8400-e29b-41d4-a716-446655440005",
    "terminal": "First"
  }'
```

**Response:**
```json
{
  "message": "Result published successfully",
  "student": {
    "id": "550e8400-e29b-41d4-a716-446655440005",
    "name": "Ahsan Ahmed",
    "class": "UKG"
  },
  "result": {
    "terminal": "First",
    "total_marks": 550,
    "total_obtained": 523,
    "percentage": 95.09,
    "division": "First"
  }
}
```

### Step 6: View Published Result
```bash
curl 'http://localhost:5000/api/marks/result/published?student_id=550e8400-e29b-41d4-a716-446655440005&terminal=First'
```

**Response:**
```json
{
  "id": "res-uuid-1",
  "student_id": "550e8400-e29b-41d4-a716-446655440005",
  "terminal": "First",
  "total_marks": 550,
  "total_obtained": 523,
  "percentage": 95.09,
  "division": "First",
  "status": "Published",
  "calculated_at": "2026-01-19T14:30:00Z",
  "students": {
    "id": "550e8400-e29b-41d4-a716-446655440005",
    "name": "Ahsan Ahmed",
    "class": "UKG",
    "roll_no": 5,
    "father_name": "Ahmed Ali"
  }
}
```

---

## Example 2: Class 6 with Multiple Subjects

### Scenario
Submit marks for a Class 6 student with 9 subjects.

### Class 6 Subjects
```bash
curl http://localhost:5000/api/marks/class/6
```

Returns:
- Hindi, English, Science, Math, Social Studies, General Knowledge, Computer, Sanskrit, Drawing

### Submit Marks for Class 6 Student
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "550e8400-e29b-41d4-a716-446655440010",
    "terminal": "First",
    "marksArray": [
      {"subject_id": "hnd-uuid", "external_marks": 72, "internal_marks": 16},
      {"subject_id": "eng-uuid", "external_marks": 78, "internal_marks": 18},
      {"subject_id": "sci-uuid", "external_marks": 85, "internal_marks": 19},
      {"subject_id": "mth-uuid", "external_marks": 90, "internal_marks": 20},
      {"subject_id": "sst-uuid", "external_marks": 75, "internal_marks": 17},
      {"subject_id": "gk-uuid", "external_marks": 68, "internal_marks": 15},
      {"subject_id": "com-uuid", "external_marks": 88, "internal_marks": 19},
      {"subject_id": "skt-uuid", "external_marks": 70, "internal_marks": 14},
      {"subject_id": "drw-uuid", "external_marks": 48, "internal_marks": 0}
    ]
  }'
```

**Calculation:**
- Hindi: 72 + 16 = 88
- English: 78 + 18 = 96
- Science: 85 + 19 = 104
- Math: 90 + 20 = 110
- Social Studies: 75 + 17 = 92
- GK: 68 + 15 = 83
- Computer: 88 + 19 = 107
- Sanskrit: 70 + 14 = 84
- Drawing: 48 + 0 = 48
- **Total: 812/850 = 95.53% → First Division** ✓

---

## Example 3: Failing Student

### Scenario
A student scores below 33% - should get "Fail" status.

### Submit Marks (Low Scores)
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "550e8400-e29b-41d4-a716-446655440020",
    "terminal": "First",
    "marksArray": [
      {"subject_id": "hnd-uuid", "external_marks": 15, "internal_marks": 3},
      {"subject_id": "eng-uuid", "external_marks": 10, "internal_marks": 2},
      {"subject_id": "mth-uuid", "external_marks": 20, "internal_marks": 5},
      {"subject_id": "evs-uuid", "external_marks": 18, "internal_marks": 4},
      {"subject_id": "gk-uuid", "external_marks": 12, "internal_marks": 3},
      {"subject_id": "drw-uuid", "external_marks": 20, "internal_marks": 0}
    ]
  }'
```

### View Result
```bash
curl 'http://localhost:5000/api/marks/result?class=UKG&roll=10&terminal=First'
```

**Response:**
```json
{
  "summary": {
    "total_max_marks": 550,
    "total_obtained": 112,
    "percentage": 20.36,
    "division": "Fail",
    "status": "Published"
  }
}
```

**Calculation:**
- Total: 112/550 = 20.36% → **Fail** ✓

---

## Example 4: Partial Marks (AB - Absent)

### Scenario
A student was absent in some subjects.

### Submit Marks (Some Missing)
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "550e8400-e29b-41d4-a716-446655440030",
    "terminal": "First",
    "marksArray": [
      {"subject_id": "hnd-uuid", "external_marks": 75, "internal_marks": 18},
      {"subject_id": "eng-uuid", "external_marks": null, "internal_marks": null},
      {"subject_id": "mth-uuid", "external_marks": 65, "internal_marks": 16},
      {"subject_id": "evs-uuid", "external_marks": 70, "internal_marks": 15},
      {"subject_id": "gk-uuid", "external_marks": null, "internal_marks": null},
      {"subject_id": "drw-uuid", "external_marks": 40, "internal_marks": 0}
    ]
  }'
```

### View Result
```bash
curl 'http://localhost:5000/api/marks/result?class=UKG&roll=15&terminal=First'
```

**Response:**
```json
{
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
      "subject": "English",
      "code": "ENG",
      "max_marks": 100,
      "external_marks": "AB",
      "internal_marks": "AB",
      "total_obtained": "AB"
    },
    {
      "subject": "Math",
      "code": "MTH",
      "max_marks": 100,
      "external_marks": 65,
      "internal_marks": 16,
      "total_obtained": 81
    },
    {
      "subject": "EVS",
      "code": "EVS",
      "max_marks": 100,
      "external_marks": 70,
      "internal_marks": 15,
      "total_obtained": 85
    },
    {
      "subject": "General Knowledge",
      "code": "GK",
      "max_marks": 100,
      "external_marks": "AB",
      "internal_marks": "AB",
      "total_obtained": "AB"
    },
    {
      "subject": "Drawing",
      "code": "DRW",
      "max_marks": 50,
      "external_marks": 40,
      "internal_marks": "AB",
      "total_obtained": 40
    }
  ],
  "summary": {
    "total_max_marks": 550,
    "total_obtained": 299,
    "percentage": 54.36,
    "division": "Second",
    "status": "Published"
  }
}
```

**Calculation:**
- Hindi: 93
- English: AB (0)
- Math: 81
- EVS: 85
- GK: AB (0)
- Drawing: 40
- **Total: 299/550 = 54.36% → Second Division** ✓

---

## Example 5: Drawing Subject Special Case

### Scenario
Verify Drawing always uses 50 marks (not 100).

### Class 1 with Drawing (50 marks)
```bash
curl http://localhost:5000/api/marks/class/1
```

**Response includes:**
```json
{
  "id": "drw-uuid",
  "name": "Drawing",
  "code": "DRW",
  "max_external_marks": 50,
  "max_internal_marks": 0
}
```

### Submit Drawing Marks
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "550e8400-e29b-41d4-a716-446655440040",
    "terminal": "First",
    "marksArray": [
      {"subject_id": "drw-uuid", "external_marks": 48, "internal_marks": 0}
    ]
  }'
```

**Important:**
- Drawing external_marks max = 50 (not 80)
- Drawing internal_marks must be 0
- System enforces these constraints

---

## Example 6: All Three Terminals

### Scenario
Submit marks for all three terminals for one student.

### Terminal 1 (First)
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{"student_id": "uuid", "terminal": "First", "marksArray": [...]}'
```

### Terminal 2 (Second)
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{"student_id": "uuid", "terminal": "Second", "marksArray": [...]}'
```

### Terminal 3 (Annual)
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{"student_id": "uuid", "terminal": "Annual", "marksArray": [...]}'
```

### View All Results
```bash
curl 'http://localhost:5000/api/marks/result?class=X&roll=Y&terminal=First'
curl 'http://localhost:5000/api/marks/result?class=X&roll=Y&terminal=Second'
curl 'http://localhost:5000/api/marks/result?class=X&roll=Y&terminal=Annual'
```

Each terminal can be published independently.

---

## Error Scenarios

### Error 1: Out of Range Marks
**Request:**
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "uuid",
    "terminal": "First",
    "marksArray": [
      {"subject_id": "hnd-uuid", "external_marks": 85, "internal_marks": 25}
    ]
  }'
```

**Problem:** internal_marks = 25, but max_internal_marks = 20

**Response:** ❌ 400 Bad Request (with validation error)

### Error 2: Invalid Terminal
**Request:**
```bash
curl 'http://localhost:5000/api/marks/result?class=UKG&roll=5&terminal=Semester1'
```

**Problem:** Terminal should be "First", "Second", or "Annual"

**Response:** ❌ 404 Not Found

### Error 3: Student Not Found
**Request:**
```bash
curl 'http://localhost:5000/api/marks/result?class=UKG&roll=999&terminal=First'
```

**Problem:** No student with roll 999 in UKG

**Response:** ❌ 404 Student not found

### Error 4: Drawing with Internal Marks
**Request:**
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "uuid",
    "terminal": "First",
    "marksArray": [
      {"subject_id": "drw-uuid", "external_marks": 45, "internal_marks": 5}
    ]
  }'
```

**Problem:** Drawing should have internal_marks = 0

**Response:** ❌ 400 Bad Request (validation error)

---

## JavaScript Integration Examples

### Fetch Subjects
```javascript
const classNname = 'UKG';
const response = await fetch(`/api/marks/class/${className}`);
const { subjects } = await response.json();
console.log(subjects); // Array of subject objects
```

### Submit Marks
```javascript
const markData = {
  student_id: "550e8400-e29b-41d4-a716-446655440005",
  terminal: "First",
  marksArray: [
    { subject_id: "uuid1", external_marks: 75, internal_marks: 18 },
    { subject_id: "uuid2", external_marks: 82, internal_marks: 19 },
  ]
};

const response = await fetch('/api/marks/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(markData)
});

const result = await response.json();
console.log(result.message); // "Marks submitted successfully"
```

### Get Result
```javascript
const params = new URLSearchParams({
  class: 'UKG',
  roll: 5,
  terminal: 'First'
});

const response = await fetch(`/api/marks/result?${params}`);
const result = await response.json();
console.log(result.summary); // { total_obtained, percentage, division, ... }
```

### Publish Result
```javascript
const response = await fetch('/api/marks/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    student_id: "550e8400-e29b-41d4-a716-446655440005",
    terminal: "First"
  })
});

const result = await response.json();
console.log(result.result.division); // "First", "Second", "Third", or "Fail"
```

---

## Summary

These examples cover:
✅ Complete UKG marking workflow
✅ Class 6 with 9 subjects
✅ Failing student (< 33%)
✅ Partial marks (absent students)
✅ Drawing special case (50 marks)
✅ All three terminals
✅ Error scenarios
✅ JavaScript integration

Use these as templates for your frontend!

