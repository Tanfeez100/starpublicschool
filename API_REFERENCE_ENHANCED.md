# Bulk Fee Generation System - Backend API Documentation

## Overview
Complete backend implementation for the enhanced bulk fee generation system with support for optional fees (transport, exam, annual) and advance payment tracking.

---

## Database Schema Updates

### 1. Migration Script
Run the migration to add new columns:
```bash
# File: migrations/003_add_optional_fees_and_advance.sql
# Adds columns to students and fees tables for optional fees and advance tracking
```

**Students Table - New Columns:**
- `uses_transport` (BOOLEAN) - Whether student uses school transport

**Fees Table - New Columns:**
- `transport_fee` (DECIMAL) - Transport fee amount
- `exam_fee` (DECIMAL) - Exam fee amount
- `annual_fee` (DECIMAL) - Annual fee amount
- `advance` (DECIMAL) - Advance payment amount
- `fine` (DECIMAL) - Fine amount for overdue payment

---

## API Endpoints

### 1. Get Students by Class
**Endpoint:** `GET /api/fees/students`

**Query Parameters:**
- `class` (required) - Class identifier (e.g., "1", "2", "3A")

**Response:** `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "John Doe",
    "father_name": "Father Name",
    "class": "1",
    "section": "A",
    "roll_no": 1,
    "uses_transport": true,
    "previous_due": 500,
    "created_at": "2024-01-01T00:00:00Z"
  }
]
```

**Error Responses:**
- `400` - Missing class parameter
- `500` - Database error

---

### 2. Generate Bulk Invoices (Preview)
**Endpoint:** `POST /api/fees/generate/bulk`

**Request Body:**
```json
{
  "className": "1",
  "month": "April",
  "baseFee": 1000,
  "finePerMonth": 50,
  "transportFee": 300,
  "examFee": 200,
  "annualFee": 50
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Generated 50 invoices for class 1",
  "count": 50,
  "invoices": [
    {
      "studentId": "uuid",
      "month": "April",
      "currentFee": 1000,
      "previousDue": 0,
      "fine": 0,
      "transportFee": 300,
      "examFee": 200,
      "annualFee": 50,
      "advance": 0,
      "totalFee": 1550,
      "breakdown": {
        "Current Month Fee": 1000,
        "Transport Fee": 300,
        "Exam Fee": 200,
        "Annual Fee": 50
      },
      "status": "DUE",
      "generatedAt": "2026-01-22T00:00:00Z"
    }
  ]
}
```

**Error Responses:**
- `400` - Missing required fields
- `500` - Database error

---

### 3. Save Bulk Invoices to Database
**Endpoint:** `POST /api/fees/invoices/bulk`

**Request Body:**
```json
{
  "invoices": [
    {
      "studentId": "uuid",
      "month": "April",
      "currentFee": 1000,
      "previousDue": 0,
      "fine": 0,
      "transportFee": 300,
      "examFee": 200,
      "annualFee": 50,
      "advance": 0,
      "totalFee": 1550,
      "breakdown": {
        "Current Month Fee": 1000,
        "Transport Fee": 300,
        "Exam Fee": 200,
        "Annual Fee": 50
      },
      "status": "DUE"
    }
  ]
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Bulk fee bills saved successfully",
  "count": 50
}
```

**Error Responses:**
- `400` - Empty invoices array
- `500` - Database save error

---

### 4. Get Fee Details
**Endpoint:** `GET /api/fees/details/:id`

**Response:** `200 OK`
```json
{
  "id": "uuid",
  "student": {
    "id": "uuid",
    "name": "John Doe",
    "father_name": "Father Name",
    "class": "1",
    "section": "A",
    "roll_no": 1,
    "uses_transport": true
  },
  "month": "April",
  "feeBreakdown": {
    "baseFee": 1000,
    "previousDue": 0,
    "fine": 0,
    "transportFee": 300,
    "examFee": 200,
    "annualFee": 50,
    "advance": 0
  },
  "totalFee": 1550,
  "paidAmount": 0,
  "balance": 1550,
  "status": "DUE",
  "breakdown": {
    "Current Month Fee": 1000,
    "Transport Fee": 300,
    "Exam Fee": 200,
    "Annual Fee": 50
  },
  "createdAt": "2026-01-22T00:00:00Z",
  "updatedAt": "2026-01-22T00:00:00Z"
}
```

---

### 5. Record Payment (with Advance Handling)
**Endpoint:** `PUT /api/fees/pay/:id`

**Request Body:**
```json
{
  "amount": 1600,
  "waiveFine": false
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Payment recorded successfully",
  "feeId": "uuid",
  "paidAmount": 1550,
  "totalFee": 1550,
  "advance": 50,
  "balance": 0,
  "status": "PAID"
}
```

**Payment Logic:**
- If `amount ≥ totalFee`: Status = "PAID", Advance = amount - totalFee
- If `amount < totalFee` and `amount > 0`: Status = "PARTIAL"
- If `amount = 0`: Status = "DUE"

**Error Responses:**
- `400` - Invalid payment amount
- `404` - Fee record not found
- `500` - Database error

---

### 6. Get Class Fees Summary
**Endpoint:** `GET /api/fees/summary`

**Query Parameters:**
- `className` (required) - Class identifier
- `month` (optional) - Filter by month

**Response:** `200 OK`
```json
{
  "className": "1",
  "month": "April",
  "summary": {
    "total": 50,
    "totalDue": 77500,
    "totalPaid": 15000,
    "totalAdvance": 2000,
    "byStatus": {
      "DUE": 35,
      "PARTIAL": 10,
      "PAID": 5
    }
  },
  "fees": [
    {
      "id": "uuid",
      "student": {
        "id": "uuid",
        "name": "John Doe",
        "class": "1",
        "roll_no": 1
      },
      "month": "April",
      "totalFee": 1550,
      "paidAmount": 0,
      "balance": 1550,
      "advance": 0,
      "status": "DUE"
    }
  ]
}
```

---

## Utility Functions

### invoiceCalculator.js

#### `generateInvoiceData(params)`
Generates invoice data for a single student.

**Parameters:**
```javascript
{
  student: { id, name, uses_transport, previous_due },
  month: string,
  currentMonthFee: number,
  finePerMonth: number (default 50),
  transportFee: number (default 0),
  examFee: number (default 0),
  annualFee: number (default 0),
  advance: number (default 0)
}
```

**Returns:**
```javascript
{
  studentId: string,
  month: string,
  currentFee: number,
  previousDue: number,
  fine: number,
  transportFee: number,
  examFee: number,
  annualFee: number,
  advance: number,
  totalFee: number,
  breakdown: object,
  status: string,
  generatedAt: string
}
```

#### `generateBulkInvoices(params)`
Generates invoices for all students in a class.

**Parameters:**
```javascript
{
  className: string,
  month: string,
  baseFee: number,
  finePerMonth: number,
  transportFee: number,
  examFee: number,
  annualFee: number
}
```

**Returns:** Array of invoice objects

#### `calculatePreviousDue(studentId, currentMonth)`
Calculates unpaid amount from previous months.

**Returns:** Number (amount due)

---

## Fee Calculation Formula

### Total Fee Calculation
```
Total Fee = Base Fee
          + Previous Due
          + Fine (if previous due > 0)
          + Transport Fee (if student uses transport)
          + Exam Fee (optional)
          + Annual Fee (optional)
          - Advance (if any)
```

### Breakdown Example
For a student with:
- Base Fee: ₹1000
- Previous Due: ₹500
- Fine: ₹50
- Transport Fee: ₹300
- Exam Fee: ₹200
- Annual Fee: ₹50

Total = 1000 + 500 + 50 + 300 + 200 + 50 = **₹2100**

---

## Advance Payment Logic

### How Advance Works
1. **Payment Received:** Student pays ₹2200 for bill of ₹2100
2. **Excess Amount:** 2200 - 2100 = ₹100 (becomes advance)
3. **Advance Field:** `advance = 100`
4. **Next Month:** Advance automatically deducted from total

### Example Flow
```
Month 1 Bill Total: ₹2100
Payment: ₹2200
Advance: ₹100
Status: PAID

Month 2 Bill Calculation:
Base Fee: ₹1000
Previous Due: ₹0 (Month 1 is paid)
Advance to Deduct: ₹100
New Total: 1000 - 100 = ₹900
```

---

## Integration Guide

### Step 1: Set Up Database
```bash
# Apply migration
# Run the migration file through Supabase dashboard or CLI
```

### Step 2: Update Frontend
Ensure frontend is sending all fee fields:
```javascript
{
  studentId,
  month,
  currentFee,      // Base fee
  previousDue,
  fine,
  transportFee,    // NEW
  examFee,         // NEW
  annualFee,       // NEW
  advance,         // NEW
  totalFee,
  breakdown,
  status
}
```

### Step 3: Test Endpoints
```bash
# Get students
GET /api/fees/students?class=1

# Generate preview
POST /api/fees/generate/bulk
Body: { className, month, baseFee, ... }

# Save invoices
POST /api/fees/invoices/bulk
Body: { invoices: [...] }

# Record payment
PUT /api/fees/pay/:id
Body: { amount: 2200 }
```

---

## Error Handling

### Common Error Codes
- `400` - Invalid request (missing fields, invalid data)
- `404` - Resource not found (student, fee record)
- `500` - Server error (database issues, calculation errors)

### Error Response Format
```json
{
  "message": "Error description",
  "error": "Additional error details (if available)"
}
```

---

## Testing Checklist

- [ ] GET `/api/fees/students?class=1` returns students with previous_due
- [ ] POST `/api/fees/generate/bulk` creates previews without saving
- [ ] POST `/api/fees/invoices/bulk` saves all fields correctly
- [ ] Transport fee only added when `uses_transport = true`
- [ ] Advance field stored and calculated correctly
- [ ] Payment endpoint handles advance deduction
- [ ] Fine only calculated once (if previous_due > 0)
- [ ] Breakdown JSON contains all fee components
- [ ] Class summary shows correct totals

---

## Important Notes

1. **Transport Fee**: Only charged if student's `uses_transport = true`
2. **Fine Calculation**: Charged once per month if there's previous due
3. **Advance Deduction**: Happens automatically in next month's total calculation
4. **Breakdown Field**: Stores JSON with all fee components for invoice generation
5. **Status Values**: Only "DUE", "PARTIAL", and "PAID" are valid

---

## File Structure

```
src/
├── routes/
│   └── fee.routes.js (Updated with new endpoints)
├── controllers/
│   ├── fee.controller.js (Original)
│   └── fee.controller.enhanced.js (New enhanced controller)
├── utils/
│   ├── feeHelper.js (Original)
│   ├── fineHelper.js (Original)
│   └── invoiceCalculator.js (New utility)
└── services/
    └── supabase.js
```

migrations/
├── 001_create_subjects_table.sql
├── 002_seed_subjects_and_curriculum.sql
└── 003_add_optional_fees_and_advance.sql (New migration)
```

---

## Version History

- **v1.0** (2026-01-22) - Initial implementation with optional fees and advance support
