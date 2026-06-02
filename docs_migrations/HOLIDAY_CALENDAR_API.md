# Holiday Calendar API Documentation

## Overview
Complete holiday calendar management system for the GPS school management app with support for multiple dates, bulk operations, and integration with attendance tracking.

## Features
- ✅ Multiple date storage with unique constraints
- ✅ Holiday type classification (national, religious, regional, school)
- ✅ Optional holidays support
- ✅ Bulk create/update operations
- ✅ Date range queries
- ✅ Attendance exclusion rules
- ✅ Audit logging for all changes
- ✅ Helper functions for common operations
- ✅ Statistics and reporting

## Database Schema

### Tables

#### holiday_calendar
```sql
- id (INT, PK, AUTO_INCREMENT)
- holiday_date (DATE, UNIQUE) - Single date for the holiday
- title (VARCHAR 255, NOT NULL)
- description (TEXT)
- holiday_type (ENUM: 'national', 'regional', 'school', 'religious')
- is_optional (BOOLEAN) - False = mandatory, True = optional
- created_by (INT, FK: users.id)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### holiday_calendar_audit
Tracks all changes to holiday calendar records
- Logs CREATE, UPDATE, DELETE actions
- Stores old and new data as JSON
- Useful for audit trails and rollback operations

#### holiday_exemption_rules
Manages which classes/sections are exempt from specific holidays
```sql
- holiday_id (INT, FK)
- class_id (INT, FK)
- section_id (INT, FK)
- reason (TEXT)
```

## API Endpoints

### Public Endpoints (No Authentication Required)

#### 1. Get All Holidays
```
GET /api/holidays
Response:
{
  "success": true,
  "data": [
    {
      "id": 1,
      "holiday_date": "2024-01-26",
      "title": "Republic Day",
      "description": "National Holiday",
      "holiday_type": "national",
      "is_optional": false
    }
  ],
  "count": 35
}
```

#### 2. Get Holidays by Year
```
GET /api/holidays/year/2024
Parameters: year (integer)

Response:
{
  "success": true,
  "year": 2024,
  "data": [...],
  "count": 18
}
```

#### 3. Get Holidays in Date Range
```
GET /api/holidays/range?startDate=2024-01-01&endDate=2024-12-31
Query Parameters:
  - startDate (required): YYYY-MM-DD
  - endDate (required): YYYY-MM-DD

Response:
{
  "success": true,
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "data": [...],
  "count": 18
}
```

#### 4. Check if Date is Holiday
```
GET /api/holidays/check/2024-01-26
Parameters: date (YYYY-MM-DD)

Response:
{
  "success": true,
  "date": "2024-01-26",
  "isHoliday": true,
  "holiday": {
    "id": 1,
    "holiday_date": "2024-01-26",
    "title": "Republic Day",
    "description": "National Holiday",
    "holiday_type": "national",
    "is_optional": false
  }
}
```

#### 5. Get Holiday Statistics
```
GET /api/holidays/stats
Response:
{
  "success": true,
  "data": [
    {
      "year": 2024,
      "total": 18,
      "national_count": 3,
      "religious_count": 12,
      "school_count": 2,
      "regional_count": 1,
      "optional_count": 14
    }
  ]
}
```

### Protected Endpoints (Authentication Required)

#### 6. Create Single Holiday
```
POST /api/holidays
Headers: Authorization: Bearer <token>

Body:
{
  "holiday_date": "2024-12-25",
  "title": "Christmas",
  "description": "Christian Festival",
  "holiday_type": "religious",
  "is_optional": true
}

Response:
{
  "success": true,
  "message": "Holiday created successfully",
  "holidayId": 35
}
```

#### 7. Bulk Create Holidays
```
POST /api/holidays/bulk
Headers: Authorization: Bearer <token>

Body:
{
  "holidays": [
    {
      "holiday_date": "2024-12-25",
      "title": "Christmas",
      "holiday_type": "religious",
      "is_optional": true
    },
    {
      "holiday_date": "2024-12-26",
      "title": "Boxing Day",
      "holiday_type": "regional",
      "is_optional": false
    }
  ]
}

Response:
{
  "success": true,
  "message": "Created 2 holidays, 0 failed",
  "successCount": 2,
  "failCount": 0
}
```

#### 8. Update Holiday
```
PUT /api/holidays/:id
Headers: Authorization: Bearer <token>

Body:
{
  "title": "Updated Title",
  "description": "Updated Description",
  "is_optional": false
}

Response:
{
  "success": true,
  "message": "Holiday updated successfully"
}
```

#### 9. Delete Holiday
```
DELETE /api/holidays/:id
Headers: Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Holiday deleted successfully"
}
```

## Database Functions (MySQL)

### Stored Procedures

#### sp_is_holiday
Check if a specific date is a holiday
```sql
CALL sp_is_holiday('2024-01-26', @is_holiday, @title, @is_optional);
SELECT @is_holiday, @title, @is_optional;
```

#### sp_get_holidays_in_range
Get all holidays between two dates
```sql
CALL sp_get_holidays_in_range('2024-01-01', '2024-12-31');
```

#### sp_get_year_holidays
Get all holidays in a specific year
```sql
CALL sp_get_year_holidays(2024);
```

### Stored Functions

#### fn_count_holidays
Count holidays between two dates
```sql
SELECT fn_count_holidays('2024-01-01', '2024-12-31');
-- Returns: 18
```

#### fn_get_next_holiday
Get the next holiday from a given date
```sql
SELECT fn_get_next_holiday('2024-01-25');
-- Returns: 2024-01-26 (Republic Day)
```

## Integration with Attendance System

When marking attendance, check holidays to:
1. Skip holiday dates automatically
2. Mark as "Holiday" status instead of "Absent"
3. Exclude optional holidays based on class/section rules

### Example: Check Attendance Date
```javascript
// Frontend
const isHoliday = await fetch('/api/holidays/check/2024-01-26')
  .then(r => r.json());

if (isHoliday.isHoliday) {
  // Show holiday info instead of attendance form
  console.log('Holiday:', isHoliday.holiday.title);
}
```

### Example: Get Working Days
```javascript
// Get holidays in date range, then calculate working days
const response = await fetch('/api/holidays/range?startDate=2024-01-01&endDate=2024-12-31');
const { data: holidays } = await response.json();

const totalDays = 365;
const holidays_count = holidays.length;
const working_days = totalDays - holidays_count;
```

## Setup Instructions

### 1. Run Database Migration
```bash
# For MySQL
mysql -u root -p < migrations/015_create_holiday_calendar.sql

# Or run via backend
npm run migrate:015
```

### 2. Register Routes in App
Update `src/app.js`:
```javascript
import holidayRoutes from './routes/holiday.routes.js';

app.use('/api/holidays', holidayRoutes);
```

### 3. Add Sample Data
Sample data (2024-2025 Indian holidays) is automatically inserted during migration.

## Holiday Types

| Type | Purpose | Examples |
|------|---------|----------|
| **national** | National holidays (mandatory) | Republic Day, Independence Day, Gandhi Jayanti |
| **religious** | Religious festivals (optional) | Holi, Diwali, Eid, Christmas |
| **regional** | Regional/state holidays | Regional festivals |
| **school** | School-specific holidays | Summer break, winter break |

## Sample Data Included

### 2024 Holidays (19 total)
- Republic Day (Jan 26)
- National holidays: 3
- Religious festivals: 12
- School holidays: 2
- Other: 2

### 2025 Holidays (16 total)
- Republic Day (Jan 26)
- Independence Day (Aug 15)
- Gandhi Jayanti (Oct 2)
- Multiple religious festivals
- School holidays

## Common Use Cases

### 1. Display Holiday Calendar in UI
```javascript
const year = 2024;
const response = await fetch(`/api/holidays/year/${year}`);
const { data: holidays } = await response.json();

// Group by month
const byMonth = {};
holidays.forEach(h => {
  const month = new Date(h.holiday_date).getMonth();
  if (!byMonth[month]) byMonth[month] = [];
  byMonth[month].push(h);
});
```

### 2. Mark Attendance with Holiday Exclusion
```javascript
// Before marking student as absent
const isHoliday = await fetch(`/api/holidays/check/${attendanceDate}`)
  .then(r => r.json());

if (isHoliday.isHoliday) {
  // Skip attendance record for holiday
  status = 'holiday';
} else {
  // Mark as present/absent/late
  status = selectedStatus;
}
```

### 3. Calculate Attendance Percentage (Exclude Holidays)
```javascript
const startDate = '2024-01-01';
const endDate = '2024-12-31';

// Get holidays
const holidays = await fetch(`/api/holidays/range?startDate=${startDate}&endDate=${endDate}`)
  .then(r => r.json());

// Working days = Total days - Holidays - Weekends
const totalDays = getDaysBetween(startDate, endDate);
const workingDays = totalDays - holidays.count - getWeekendDays(startDate, endDate);
```

## Error Handling

### Common Errors

```json
{
  "400": "Invalid date format or missing required fields",
  "404": "Holiday not found",
  "409": "Holiday on this date already exists",
  "500": "Server error"
}
```

## Performance Tips

1. **Use Indexes**: Date and year indexes are created for fast queries
2. **Cache Results**: Cache yearly holidays at application startup
3. **Batch Operations**: Use bulk endpoints for multiple holidays
4. **Date Ranges**: Limit date range queries to reasonable periods

## Audit & Compliance

- All changes are logged in `holiday_calendar_audit` table
- Track who created/modified holidays
- JSON format stores complete change history
- Useful for compliance and rollback operations

## Future Enhancements

- [ ] Holiday series (recurring holidays)
- [ ] Regional holiday management
- [ ] Holiday substitution days
- [ ] Attendance impact reports
- [ ] Holiday calendar exports (iCal format)
- [ ] Mobile app integration
