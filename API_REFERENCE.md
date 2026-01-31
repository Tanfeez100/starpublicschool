# Marks System - API Reference

## Base URL
```
http://localhost:5000/api/marks
```

---

## Endpoints

### 1. Get Class Subjects
Fetch all subjects configured for a specific class.

```http
GET /class/:class
```

**Parameters:**
- `class` (path) - Class name (e.g., "UKG", "1", "6")

**Example:**
```bash
GET /api/marks/class/UKG
```

**Response (200):**
```json
{
  "class": "UKG",
  "subjects": [
    {
      "id": "8fbad5f0-...",
      "name": "Hindi",
      "code": "HND",
      "max_external_marks": 80,
      "max_internal_marks": 20
    },
    {
      "id": "9fbad5f0-...",
      "name": "Drawing",
      "code": "DRW",
      "max_external_marks": 50,
      "max_internal_marks": 0
    }
  ]
}
```

---

### 2. Get Student Result
Fetch marks and result summary for a student in a terminal.

```http
GET /result?class=CLASS&roll=ROLL&terminal=TERMINAL
```

**Query Parameters:**
- `class` (required) - Student's class
- `roll` (required) - Student's roll number
- `terminal` (required) - "First", "Second", or "Annual"

**Example:**
```bash
GET /api/marks/result?class=UKG&roll=5&terminal=First
```

**Response (200):**
```json
{
  "student": {
    "id": "uuid-...",
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
      "external_marks": "AB",
      "internal_marks": "AB",
      "total_obtained": "AB"
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

**Errors:**
- `400` - Missing required parameters
- `404` - Student not found or no subjects for class
- `500` - Server error

---

### 3. Submit Marks
Submit marks for a student (admin operation).

```http
POST /submit
Content-Type: application/json
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
      "subject_id": "uuid-drawing",
      "external_marks": 45,
      "internal_marks": 0
    }
  ]
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "550e8400-e29b-41d4-a716-446655440000",
    "terminal": "First",
    "marksArray": [
      {
        "subject_id": "8fbad5f0-a78e-4f2a-b456-ccde7fda4c17",
        "external_marks": 75,
        "internal_marks": 18
      },
      {
        "subject_id": "9fbad5f0-a78e-4f2a-b456-ccde7fda4c18",
        "external_marks": 45,
        "internal_marks": 0
      }
    ]
  }'
```

**Response (200):**
```json
{
  "message": "Marks submitted successfully",
  "student_id": "550e8400-e29b-41d4-a716-446655440000",
  "terminal": "First",
  "count": 6
}
```

**Validation Rules:**
- `external_marks` must be ≤ `max_external_marks`
- `internal_marks` must be ≤ `max_internal_marks`
- Drawing: internal_marks must be 0
- All marks must be >= 0

**Errors:**
- `400` - Invalid request body or validation failed
- `404` - Student not found
- `500` - Database error

---

### 4. Publish Result
Lock marks and calculate final result summary.

```http
POST /publish
Content-Type: application/json
```

**Body:**
```json
{
  "student_id": "uuid-of-student",
  "terminal": "First"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/marks/publish \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "550e8400-e29b-41d4-a716-446655440000",
    "terminal": "First"
  }'
```

**Response (200):**
```json
{
  "message": "Result published successfully",
  "student": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
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

**Side Effects:**
- Marks status changed to "LOCKED"
- Result summary saved to `result_summary` table
- Can't re-submit marks after publishing

**Errors:**
- `400` - Missing required parameters
- `404` - Student not found
- `500` - Database error

---

### 5. Get Published Result
Fetch a published and locked result.

```http
GET /result/published?student_id=STUDENT_ID&terminal=TERMINAL
```

**Query Parameters:**
- `student_id` (required) - UUID of student
- `terminal` (required) - "First", "Second", or "Annual"

**Example:**
```bash
GET /api/marks/result/published?student_id=550e8400-e29b-41d4-a716-446655440000&terminal=First
```

**Response (200):**
```json
{
  "id": "uuid-...",
  "student_id": "550e8400-e29b-41d4-a716-446655440000",
  "terminal": "First",
  "total_marks": 550,
  "total_obtained": 510,
  "percentage": 92.73,
  "division": "First",
  "status": "Published",
  "calculated_at": "2026-01-19T10:30:00Z",
  "students": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Ahsan Ahmed",
    "class": "UKG",
    "roll_no": 5,
    "father_name": "Ahmed Ali"
  }
}
```

**Errors:**
- `400` - Missing required parameters
- `404` - Result not published yet
- `500` - Server error

---

## Data Types & Constraints

### Marks
- `external_marks`: 0 to `max_external_marks` (decimal, 2 decimals)
- `internal_marks`: 0 to `max_internal_marks` (decimal, 2 decimals)
- Special: Drawing = 50 external, 0 internal

### Terminal
- "First" (Terminal 1)
- "Second" (Terminal 2)
- "Annual" (Final)

### Division
- "First" if percentage >= 60%
- "Second" if percentage >= 45% and < 60%
- "Third" if percentage >= 33% and < 45%
- "Fail" if percentage < 33%

### Status
- "PENDING" - Marks not yet submitted
- "SUBMITTED" - Marks submitted, not locked
- "LOCKED" - Result published, marks locked

---

## Class & Subject Reference

### M.C / Nursery / LKG
- Hindi (HND) - 80/20
- Hindi Writing (HNW) - 80/20
- English (ENG) - 80/20
- English Writing (ENW) - 80/20
- Math (MTH) - 80/20
- Drawing (DRW) - 50/0

### UKG
- Hindi (HND) - 80/20
- English (ENG) - 80/20
- Math (MTH) - 80/20
- EVS (EVS) - 80/20
- General Knowledge (GK) - 80/20
- Drawing (DRW) - 50/0

### Classes 1-5
- Hindi (HND) - 80/20
- English (ENG) - 80/20
- Math (MTH) - 80/20
- EVS (EVS) - 80/20
- Sanskrit (SKT) - 80/20
- Computer (COM) - 80/20
- General Knowledge (GK) - 80/20
- Drawing (DRW) - 50/0

### Classes 6-8
- Hindi (HND) - 80/20
- English (ENG) - 80/20
- Science (SCI) - 80/20
- Math (MTH) - 80/20
- Social Studies (SST) - 80/20
- General Knowledge (GK) - 80/20
- Computer (COM) - 80/20
- Sanskrit (SKT) - 80/20
- Drawing (DRW) - 50/0

---

## Common Workflows

### Workflow 1: Submit & Publish Results for One Student

```bash
# 1. Get subjects for class
curl http://localhost:5000/api/marks/class/UKG

# 2. Submit marks
curl -X POST http://localhost:5000/api/marks/submit \
  -H "Content-Type: application/json" \
  -d '{"student_id":"...", "terminal":"First", "marksArray":[...]}'

# 3. View result (preview)
curl 'http://localhost:5000/api/marks/result?class=UKG&roll=5&terminal=First'

# 4. Publish result (lock)
curl -X POST http://localhost:5000/api/marks/publish \
  -H "Content-Type: application/json" \
  -d '{"student_id":"...", "terminal":"First"}'
```

### Workflow 2: Get Published Results

```bash
# Get published result for viewing/printing
curl 'http://localhost:5000/api/marks/result/published?student_id=...&terminal=First'
```

---

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| 400 | Class/roll/terminal required | Missing query parameters |
| 404 | Student not found | No student with that class/roll |
| 404 | No subjects found | Class not in curriculum |
| 404 | Result not published yet | Trying to get unpublished result |
| 500 | Server error | Database or system error |

