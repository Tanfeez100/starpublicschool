# Excel Batch Migration API

## Overview
This endpoint allows uploading an Excel file with student data and migrating all students from all sheets/classes in a single request.

## Endpoint

```
POST /api/migration/from-excel
```

### Authentication
- **Required**: Admin Only
- Include authorization header with valid admin token

### Content-Type
```
multipart/form-data
```

## Request

### Form Data Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | File (.xlsx) | ✅ Yes | Excel file with student data (max 50 MB) |
| `migration_month` | String | ✅ Yes | Migration month in YYYY-MM format (e.g., "2026-03") |

### Excel File Format

**Supported Formats:**
- `.xlsx` files (recommended)
- `.xls` files

**Required Columns** (in any order):
- `class` - Class number (e.g., 8, 9, 10)
- `section` - Section letter (e.g., A, B, C)
- `roll_no` - Roll number (positive integer)
- `pending_due` - Previous due amount (number, optional defaults to 0)
- `advance` - Advance payment amount (number, optional defaults to 0)
- `current_month_total` - Current month fee (number, optional defaults to 0)

**Sheet Structure:**
- Can have **multiple sheets** (one per class, per combined class+section, etc.)
- Each sheet name can be anything (name is not used)
- All sheets are processed automatically
- Example: Sheet "8_A", Sheet "8_B", Sheet "9_A", etc.

### Example Excel Data

```csv
class | roll_no | section | pending_due | advance | current_month_total
------|---------|---------|-------------|---------|--------------------
8     | 1       | A       | 600         | 0       | 0
8     | 2       | A       | 700         | 100     | 0
8     | 3       | A       | 900         | 0       | 0
8     | 1       | B       | 500         | 0       | 0
8     | 2       | B       | 600         | 50      | 0
9     | 1       | A       | 800         | 0       | 0
9     | 2       | A       | 900         | 100     | 0
```

### cURL Example

```bash
curl -X POST http://localhost:5000/api/migration/from-excel \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "file=@class8_students.xlsx" \
  -F "migration_month=2026-03"
```

### JavaScript/Fetch Example

```javascript
const fileInput = document.getElementById('fileInput');
const migrationMonth = '2026-03';

const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('migration_month', migrationMonth);

const response = await fetch('/api/migration/from-excel', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
  },
  body: formData,
});

const result = await response.json();
console.log(result);
```

### Axios Example

```javascript
import axios from 'axios';

const uploadExcelFile = async (file, migrationMonth, adminToken) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('migration_month', migrationMonth);

  try {
    const response = await axios.post(
      '/api/migration/from-excel',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error('Upload failed:', error.response?.data || error.message);
    throw error;
  }
};
```

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Migration completed from Excel file",
  "migration_month": "2026-03",
  "sheets_processed": 2,
  "class_sections_processed": 3,
  "total_migrated": 12,
  "total_errors": 2,
  "results": [
    {
      "class": "8",
      "section": "A",
      "status": "SUCCESS",
      "students_processed": 8,
      "dues_inserted": 7,
      "advances_inserted": 2,
      "skipped": 1,
      "errors": []
    },
    {
      "class": "8",
      "section": "B",
      "status": "SUCCESS",
      "students_processed": 8,
      "dues_inserted": 8,
      "advances_inserted": 3,
      "skipped": 0,
      "errors": []
    },
    {
      "class": "9",
      "section": "A",
      "status": "SUCCESS",
      "students_processed": 5,
      "dues_inserted": 4,
      "advances_inserted": 1,
      "skipped": 1,
      "errors": []
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `success` | Boolean | Whether the overall operation succeeded |
| `message` | String | Descriptive message |
| `migration_month` | String | The migration month used |
| `sheets_processed` | Number | Total Excel sheets processed |
| `class_sections_processed` | Number | Number of unique class/section combinations |
| `total_migrated` | Number | Total number of dues/advances migrated |
| `total_errors` | Number | Total number of failed migrations |
| `results` | Array | Detailed results per class/section |

### Results Array Fields

| Field | Type | Description |
|-------|------|-------------|
| `class` | String | Class number |
| `section` | String | Section letter |
| `status` | String | "SUCCESS", "FAILED", or "ERROR" |
| `students_processed` | Number | Students in this class/section |
| `dues_inserted` | Number | Number of previous dues inserted (success) |
| `advances_inserted` | Number | Number of advances inserted (success) |
| `skipped` | Number | Students skipped (not found in DB) |
| `errors` | Array | Detailed error messages for each failed student |
| `message` | String | Error message (if failed) |

### Error Response (400/409/500)

```json
{
  "message": "Description of the error",
  "error": "Detailed error message"
}
```

## Common Errors

### 400 Bad Request

- **No file provided**
  ```json
  {"message": "Excel file is required"}
  ```

- **Invalid migration month**
  ```json
  {"message": "migration_month must be in YYYY-MM format"}
  ```

- **Invalid file format**
  ```json
  {"message": "Only Excel files (.xlsx, .xls) are allowed"}
  ```

- **File too large**
  ```json
  {"message": "File exceeds maximum size of 50 MB"}
  ```

- **No valid student data**
  ```json
  {"message": "No valid student data found in Excel file"}
  ```

### 409 Conflict

- **Migration already in progress**
  ```json
  {"message": "Opening balance migration for 2026-03 is already in progress"}
  ```

- **Migration already completed**
  ```json
  {"message": "Opening balance migration is already completed for 2026-03"}
  ```

### 500 Internal Server Error

- **Database error**
  ```json
  {
    "message": "Failed to process Excel file migration",
    "error": "Detailed error message"
  }
  ```

## Validation Rules

1. **Class & Section** must exist in database
2. **Roll No** must be a positive integer
3. **pending_due** and **advance** must be non-negative numbers
4. **Class + Section + RollNo** combination must exist in students table
5. **migration_month** must be in YYYY-MM format

## Processing Flow

1. ✅ File validation (format, size, content)
2. ✅ Parse Excel sheets (all sheets processed)
3. ✅ Group students by class & section combinations
4. ✅ For each class/section:
   - Check migration lock (prevent concurrent migrations)
   - Validate students exist in database
   - Migrate previous dues
   - Migrate advance payments
   - Generate bills automatically
   - Mark migration as completed
5. ✅ Log all migration activities to `migration_logs` table
6. ✅ Return detailed results

## Notes

- **Timeout**: Requests have 5-minute timeout (suitable for large files)
- **Atomic Operations**: Each class/section migration is atomic
- **Bill Generation**: Bills are automatically generated post-migration
- **Logging**: All migrations are logged in `migration_logs` table for audit trail
- **Concurrency Control**: Migration locks prevent concurrent migrations for same month
- **Retry Logic**: If a student is not found, they are skipped with error logged

## Permissions

Only users with **Admin** role can access this endpoint.

## Testing

### Using FormData in Browser

```javascript
const fileInput = document.querySelector('input[type="file"]');
const monthInput = document.querySelector('input[name="migration_month"]');
const token = localStorage.getItem('adminToken');

const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('migration_month', monthInput.value);

fetch('/api/migration/from-excel', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
})
.then(r => r.json())
.then(data => console.log('Result:', data));
```

### Using Postman

1. Set method to **POST**
2. URL: `http://localhost:5000/api/migration/from-excel`
3. Headers:
   - `Authorization`: `Bearer YOUR_ADMIN_TOKEN`
4. Body (form-data):
   - Key: `file`, Value: Select your .xlsx file
   - Key: `migration_month`, Value: `2026-03`
5. Click **Send**

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Excel file is required" | Make sure you're sending the file in the `file` form field |
| "Only Excel files allowed" | Ensure file is .xlsx or .xls format |
| "migration_month must be YYYY-MM" | Use format like "2026-03", not "03/2026" or other formats |
| "Migration already in progress" | Wait for previous migration to complete or use `/api/migration/cancel` |
| "Student not found" errors | Verify students exist in database and class+section+roll_no combination matches |
| Request timeout | File may be too large; try splitting into smaller chunks |

## API Limits

- **File Size**: Maximum 50 MB
- **Timeout**: 5 minutes per request
- **Rate Limiting**: Subject to admin auth limits
- **Concurrent Requests**: Only one migration per month at a time

---

🎉 **Happy Migrating!** For issues or questions, contact the backend team.
