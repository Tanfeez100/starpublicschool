# Fee Management System - API Documentation

## 📋 Overview

This document describes all the APIs for the Fee Management System backend. All APIs require JWT authentication unless specified otherwise.

**Base URL:** `http://localhost:5000/api`

**Authentication:** Include JWT token in Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## 🔐 Authentication APIs

### POST /api/auth/login
Login and get JWT token.

**Body:**
```json
{
  "email": "admin@school.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "admin@school.com",
    "role": "admin"
  },
  "session": { ... },
  "token_info": {
    "expires_at": "2024-01-22T12:00:00Z",
    "expires_in": 1800
  }
}
```

---

## 📚 Fee Structure Management APIs

### POST /api/fee-structure
Create a new fee structure entry.

**Access:** Admin Only

**Body:**
```json
{
  "class": "1",
  "section": "A",
  "fee_name": "Tuition Fee",
  "fee_amount": 5000,
  "is_optional": false
}
```

**Response:**
```json
{
  "message": "Fee structure created successfully",
  "data": {
    "id": "uuid",
    "class": "1",
    "section": "A",
    "fee_name": "Tuition Fee",
    "fee_amount": 5000,
    "is_optional": false,
    "created_at": "2024-01-22T10:00:00Z"
  }
}
```

### GET /api/fee-structure?class=&section=
Get fee structures with optional filters.

**Access:** Admin Only

**Query Parameters:**
- `class` (optional): Filter by class
- `section` (optional): Filter by section

**Response:**
```json
{
  "message": "Fee structures fetched successfully",
  "count": 5,
  "data": [
    {
      "id": "uuid",
      "class": "1",
      "section": "A",
      "fee_name": "Tuition Fee",
      "fee_amount": 5000,
      "is_optional": false
    }
  ]
}
```

### PUT /api/fee-structure/:id
Update fee structure.

**Access:** Admin Only

**Body:**
```json
{
  "fee_amount": 5500,
  "is_optional": true
}
```

**Response:**
```json
{
  "message": "Fee structure updated successfully",
  "data": { ... }
}
```

### DELETE /api/fee-structure/:id
Delete fee structure.

**Access:** Admin Only

**Response:**
```json
{
  "message": "Fee structure deleted successfully",
  "id": "uuid"
}
```

---

## 💰 Bulk Bill Generation APIs

### POST /api/billing/generate-bulk
Generate bulk bills with checkbox options.

**Access:** Admin Only

**Body:**
```json
{
  "class": "1",
  "section": "A",
  "month": "2024-01",
  "includeAnnualFee": true,
  "includeExamFee": true,
  "includeComputerFee": false,
  "includeOptionalFees": true
}
```

**Response:**
```json
{
  "message": "Bulk bills generation completed",
  "month": "2024-01",
  "class": "1",
  "section": "A",
  "totalStudents": 30,
  "successCount": 30,
  "errorCount": 0
}
```

### GET /api/billing/bill/:id
Get a single bill by ID.

**Access:** Admin Only

**Response:**
```json
{
  "message": "Bill fetched successfully",
  "data": {
    "id": "uuid",
    "student_id": "uuid",
    "month": "2024-01",
    "total_amount": 5500,
    "bill_status": "unpaid",
    "items": [
      {
        "id": "uuid",
        "fee_name": "Tuition Fee",
        "amount": 5000
      }
    ],
    "payments": [],
    "total_paid": 0,
    "remaining": 5500
  }
}
```

### GET /api/billing/download?class=&month=&section=
Download bills as PDF (4 bills per page).

**Access:** Admin Only

**Query Parameters:**
- `class` (required): Class name
- `month` (required): Month in YYYY-MM format
- `section` (optional): Section name

**Response:** PDF file download

---

## 📅 Close Month & Dues APIs

### POST /api/fees/close-month
Close a month and handle dues for unpaid fees.

**Access:** Admin Only

**Body:**
```json
{
  "month": "2024-01"
}
```

**Response:**
```json
{
  "message": "Month 2024-01 closed successfully",
  "closure": {
    "id": "uuid",
    "month": "2024-01",
    "year": 2024,
    "closed_at": "2024-01-22T10:00:00Z"
  },
  "dues_created": 5,
  "total_dues_amount": 15000,
  "unpaid_bills": 5
}
```

### GET /api/fees/dues/:student_id
Get dues for a student.

**Access:** Admin or Teacher

**Response:**
```json
{
  "message": "Dues fetched successfully",
  "student_id": "uuid",
  "total_dues": 5000,
  "dues": [
    {
      "id": "uuid",
      "amount": 5000,
      "month": "2024-01",
      "status": "pending"
    }
  ],
  "count": 1
}
```

---

## 📊 Fee List & Payment APIs

### GET /api/fees/list?class=&section=&month=
Get fee list for dashboard.

**Access:** Admin or Teacher

**Query Parameters:**
- `class` (optional): Filter by class
- `section` (optional): Filter by section
- `month` (optional): Filter by month (YYYY-MM)

**Response:**
```json
{
  "message": "Fee list fetched successfully",
  "data": [
    {
      "student_id": "uuid",
      "student_name": "John Doe",
      "father_name": "Father Name",
      "roll_no": "001",
      "class": "1",
      "section": "A",
      "total_fee": 5500,
      "total_paid": 3000,
      "dues": 2500,
      "advance": 0
    }
  ],
  "count": 30
}
```

### POST /api/fees/pay
Record fee payment.

**Access:** Admin Only

**Body:**
```json
{
  "student_id": "uuid",
  "bill_id": "uuid",
  "amount_paid": 3000,
  "payment_mode": "cash",
  "payment_date": "2024-01-22"
}
```

**Payment Modes:** `cash`, `cheque`, `online`, `bank_transfer`

**Response:**
```json
{
  "message": "Payment recorded successfully",
  "payment": {
    "id": "uuid",
    "student_id": "uuid",
    "bill_id": "uuid",
    "amount_paid": 3000,
    "payment_mode": "cash",
    "payment_date": "2024-01-22"
  },
  "bill_status": "partial",
  "total_paid": 3000,
  "remaining": 2500
}
```

### GET /api/fees/invoice/:bill_id
Get invoice details.

**Access:** Admin or Teacher

**Response:**
```json
{
  "message": "Invoice fetched successfully",
  "invoice": {
    "bill_id": "uuid",
    "invoice_number": "INV-12345678",
    "date": "2024-01-22T10:00:00Z",
    "student": {
      "name": "John Doe",
      "roll_no": "001",
      "class": "1",
      "section": "A"
    },
    "items": [
      {
        "fee_name": "Tuition Fee",
        "amount": 5000
      }
    ],
    "payments": [],
    "total_amount": 5500,
    "total_paid": 0,
    "remaining": 5500,
    "status": "unpaid"
  }
}
```

---

## 🧾 Invoice Download API

### GET /api/invoice/download/:bill_id
Download invoice as professional PDF.

**Access:** Admin or Teacher

**Response:** PDF file download

**Features:**
- Professional invoice layout
- School details header
- Student information
- Detailed fee breakdown
- Payment history
- Total paid / remaining
- Status badge
- Invoice number

---

## 📝 Notes

### Error Responses

All APIs return standard error responses:

```json
{
  "message": "Error description",
  "error": "Detailed error message (if available)"
}
```

**Status Codes:**
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Server Error

### Authentication

- Most APIs require authentication via JWT token
- Admin-only APIs: Fee structure management, bill generation, payments, month closing
- Admin or Teacher APIs: View fees, invoices, dues

### Date Formats

- Month format: `YYYY-MM` (e.g., "2024-01")
- Date format: `YYYY-MM-DD` (e.g., "2024-01-22")

### Payment Modes

Valid payment modes:
- `cash`
- `cheque`
- `online`
- `bank_transfer`

---

## 🔄 API Workflow Example

1. **Setup Fee Structure:**
   ```
   POST /api/fee-structure
   ```

2. **Generate Bills:**
   ```
   POST /api/billing/generate-bulk
   ```

3. **View Fee List:**
   ```
   GET /api/fees/list?class=1&month=2024-01
   ```

4. **Record Payment:**
   ```
   POST /api/fees/pay
   ```

5. **Download Invoice:**
   ```
   GET /api/invoice/download/:bill_id
   ```

6. **Close Month:**
   ```
   POST /api/fees/close-month
   ```

---

## 📦 Database Tables

The system uses the following tables:

- `fee_structures` - Fee structure definitions
- `fee_bills` - Generated bills
- `fee_bill_items` - Individual fee items in bills
- `fee_payments` - Payment records
- `previous_dues` - Previous month dues
- `month_closures` - Closed months tracking
- `students` - Student information

---

## 🚀 Getting Started

1. Run database migration:
   ```sql
   -- Execute migrations/006_create_fee_management_tables.sql
   ```

2. Start the server:
   ```bash
   npm run dev
   ```

3. Login to get JWT token:
   ```
   POST /api/auth/login
   ```

4. Use the token in subsequent requests:
   ```
   Authorization: Bearer <token>
   ```

