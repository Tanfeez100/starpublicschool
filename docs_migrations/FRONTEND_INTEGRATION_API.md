# Frontend Integration API Guide

This guide covers the API payloads the frontend needs for subjects, marks, and results.

## Base Paths

- `/api/subjects`
- `/api/marks`
- `/api/result`
- `/api/results`

## Important Rules

- Results are only visible after an admin publishes them.
- Publish will fail if any subject mark for the selected class/terminal is missing or not `SUBMITTED`.
- Locked marks can still be edited for scrutiny. Any edit clears the published summary, so the result becomes unpublished again until republished.
- Subject sequence cannot duplicate within the same class/section scope.
- Removing a subject from a class clears related marks and invalidates published results for affected students.

## Subjects API

### 1. Get all subjects

`GET /api/subjects`

Response shape:

```json
{
  "success": true,
  "summary": {
    "total_classes": 0,
    "total_subject_mappings": 0,
    "total_unique_subjects": 0,
    "subjects_per_class": []
  },
  "classes": [],
  "all_subjects": []
}
```

### 2. Get subjects for a class

`GET /api/subjects/class/:class?section=A`

Response shape:

```json
{
  "success": true,
  "class": "1",
  "section": "A",
  "subjects": [
    {
      "id": "class_subject_row_id",
      "section": "A",
      "sequence": 1,
      "subject": {
        "id": "subject_id",
        "name": "Hindi",
        "code": "HND"
      }
    }
  ],
  "count": 1
}
```

### 3. Add a subject to a class

`POST /api/subjects/add`

Body:

```json
{
  "class": "1",
  "section": "A",
  "subject_name": "Hindi",
  "sequence": 1
}
```

Notes:

- `subject_name` or `subject_code` is required.
- `section` is optional, but if used it becomes part of the class-subject scope.
- `sequence` is optional. If omitted, the next available position is used.

### 4. Add multiple subjects

`POST /api/subjects/add-multiple`

Body:

```json
{
  "class": "1",
  "section": "A",
  "subjects": [
    { "subject_id": "uuid-1" },
    { "subject_id": "uuid-2" }
  ]
}
```

### 5. Update subject position

`PUT /api/subjects/sequence/:id`

Body:

```json
{
  "sequence": 2
}
```

Behavior:

- Returns `409` if the target sequence already exists in the same class/section scope.

### 6. Remove a subject from a class

`DELETE /api/subjects/remove/:id`

or

`DELETE /api/subjects/remove?class=1&section=A&subject_name=Hindi`

Behavior:

- Removes the class mapping.
- Deletes related marks.
- Invalidates published results for affected students.

### 7. Delete a master subject

`DELETE /api/subjects/:id`

or

`DELETE /api/subjects?subject_name=Hindi`

Behavior:

- Removes the subject from the master list.
- Cascades to class mappings and marks.
- Invalidates published results for affected students.

## Marks API

### 1. Get class marks grid for teacher/admin

`GET /api/marks?class=1&section=A&terminal=First`

Response shape:

```json
{
  "success": true,
  "class": "1",
  "section": "A",
  "terminal": "First",
  "students": [
    {
      "student_id": "student_id",
      "name": "Asha",
      "class": "1",
      "section": "A",
      "roll_no": 1,
      "marks": [
        {
          "subject_id": "subject_id",
          "subject_name": "Hindi",
          "subject_code": "HND",
          "external_marks": 45,
          "internal_marks": 18,
          "status": "SUBMITTED"
        }
      ]
    }
  ],
  "count": 1
}
```

### 2. Submit marks

`POST /api/marks/submit`

Body:

```json
{
  "class": "1",
  "section": "A",
  "terminal": "First",
  "roll_no": 1,
  "marks": [
    {
      "subject_name": "Hindi",
      "external_marks": 45,
      "internal_marks": 18
    }
  ]
}
```

Behavior:

- New rows are inserted with `status: "SUBMITTED"`.
- If marks already exist, the API skips them and asks the frontend to avoid duplicate submission.
- The response includes how many rows were inserted and which ones were skipped.

### 3. Publish result

`POST /api/marks/publish`

Body:

```json
{
  "class": "1",
  "section": "A",
  "terminal": "First"
}
```

Behavior:

- Fails with `409` if any mark is missing or not `SUBMITTED`.
- On success, marks are locked and result summaries are written.

## Public Result API

### 1. Student result by class/roll

`GET /api/marks/result?class=1&section=A&roll=1&terminal=First&academic_year=2025-26`

or

`GET /api/result?class=1&section=A&roll=1&terminal=First&academic_year=2025-26`

Response shape:

```json
{
  "student": {
    "id": "student_id",
    "name": "Asha",
    "father_name": "Ravi",
    "mother_name": "Sunita",
    "class": "1",
    "section": "A",
    "roll_no": 1,
    "academic_year": "2025-26"
  },
  "terminal": "First",
  "marks": [
    {
      "subject": "Hindi",
      "subjectCode": "HND",
      "term": "First",
      "externalMarks": 45,
      "internalMarks": 18,
      "fullMarksExternal": 80,
      "fullMarksInternal": 20,
      "obtained": 63,
      "code": "HND",
      "max_marks": 100,
      "external_marks": 45,
      "internal_marks": 18,
      "total_obtained": 63
    }
  ],
  "summary": {
    "totalObtained": 63,
    "totalFullMarks": 100,
    "percentage": 63,
    "division": "First",
    "total_obtained": 63,
    "total_max_marks": 100,
    "status": "Published",
    "rank": 1,
    "published_date": "2026-03-22"
  }
}
```

Behavior:

- Returns `404` with `Result not published yet` until the admin publishes it.

## FE Integration Notes

- Use `GET /api/subjects/class/:class` to load the subject list for the marks grid.
- Use `GET /api/marks` for the teacher marks entry table.
- The teacher marks grid only returns active students.
- Use `POST /api/marks/submit` only for first-time entry. If the student already has marks, the API will skip them.
- There is no separate edit endpoint in the current flow.
- Treat `SUBMITTED` as editable, `LOCKED` as already published, and `Published` as visible to students.
- If the student result endpoint returns `404`, hide the result page and show a "not published yet" message.
- If publish returns `409`, show the missing or non-submitted subjects list to the admin before allowing retry.
