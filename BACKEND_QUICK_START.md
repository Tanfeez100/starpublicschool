# Backend Implementation - Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### Step 1: Apply Database Migration
```sql
-- Run this in Supabase SQL editor:
-- File: migrations/003_add_optional_fees_and_advance.sql

ALTER TABLE students
ADD COLUMN IF NOT EXISTS uses_transport BOOLEAN DEFAULT FALSE;

ALTER TABLE fees
ADD COLUMN IF NOT EXISTS transport_fee DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS exam_fee DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS annual_fee DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS advance DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fine DECIMAL(10, 2) DEFAULT 0;
```

**Verify:**
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name='fees' AND column_name IN ('transport_fee', 'exam_fee', 'annual_fee', 'advance', 'fine');
```

---

### Step 2: Files Already Updated

These files have been updated/created and are ready to use:

#### ✅ **src/routes/fee.routes.js** (Updated)
- Added: `GET /api/fees/students?class={className}`
- Updated: `POST /api/fees/invoices/bulk` (now saves all fee fields)
- Enhanced: `PUT /api/fees/pay/:id` (advance logic)

#### ✅ **src/utils/invoiceCalculator.js** (New)
```javascript
import { 
  generateInvoiceData, 
  generateBulkInvoices, 
  calculatePreviousDue 
} from "../utils/invoiceCalculator.js";
```

#### ✅ **src/controllers/fee.controller.enhanced.js** (New)
```javascript
import { 
  generateBulkFeesEnhanced,
  saveBulkInvoices,
  getFeeDetails,
  recordPayment,
  getClassFeesSummary
} from "../controllers/fee.controller.enhanced.js";
```

---

### Step 3: Test Endpoints (Use Postman or cURL)

#### Test 1: Get Students by Class
```bash
curl -X GET "http://localhost:5000/api/fees/students?class=1"
```
Expected response: Array of students with `previous_due`

#### Test 2: Save Bulk Invoices
```bash
curl -X POST "http://localhost:5000/api/fees/invoices/bulk" \
  -H "Content-Type: application/json" \
  -d '{
    "invoices": [
      {
        "studentId": "uuid-here",
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
  }'
```

#### Test 3: Record Payment with Advance
```bash
curl -X PUT "http://localhost:5000/api/fees/pay/{feeId}" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1600
  }'
```
Expected: `advance: 50`

---

## 📋 What Changed

### Database
- **students**: Added `uses_transport` column
- **fees**: Added 5 new columns for optional fees and advance

### API Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/fees/students` | Fetch students by class with previous_due |
| POST | `/api/fees/invoices/bulk` | Save invoices with all fee fields |
| PUT | `/api/fees/pay/:id` | Record payment with advance calculation |

### Utilities
- `invoiceCalculator.js` - All fee calculation logic
- `fee.controller.enhanced.js` - Enhanced controller functions

---

## 📊 Fee Calculation Formula

```
Total Fee = Base Fee 
          + Previous Due
          + Fine (if previous due > 0)
          + Transport Fee (if uses_transport = true)
          + Exam Fee (optional)
          + Annual Fee (optional)
          - Advance (if any)
```

---

## 💰 Advance Payment Example

### Scenario:
- Bill Total: ₹1550
- Payment: ₹1600
- Advance: ₹50 (returned in response)

### Response:
```json
{
  "status": "PAID",
  "advance": 50,
  "balance": 0
}
```

### For Next Month:
The advance (₹50) will be deducted from next month's total fee.

---

## ✅ Verification Checklist

- [ ] Migration applied successfully in Supabase
- [ ] `uses_transport` column exists in students table
- [ ] 5 new columns exist in fees table
- [ ] GET `/api/fees/students?class=1` returns students
- [ ] POST `/api/fees/invoices/bulk` saves to DB
- [ ] PUT `/api/fees/pay/:id` calculates advance correctly
- [ ] Breakdown JSON is stored in fees table
- [ ] No errors in terminal/logs

---

## 🔍 Troubleshooting

### Issue: Column already exists error
**Fix:** Columns use `IF NOT EXISTS`, should not error

### Issue: Previous due showing 0
**Fix:** Student must have unpaid fees with status "DUE" or "PARTIAL"

### Issue: Transport fee not included
**Fix:** Ensure student `uses_transport = true` in students table

### Issue: Advance not returned in payment response
**Fix:** Verify fees table has `advance` column

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `API_REFERENCE_ENHANCED.md` | Complete API docs |
| `BACKEND_IMPLEMENTATION_COMPLETE.md` | Implementation details |
| `migrations/003_add_optional_fees_and_advance.sql` | Database migration |

---

## 🎯 Next Steps

1. ✅ Apply migration (this step)
2. 🔄 Test endpoints with provided examples
3. 📱 Connect frontend to new endpoints
4. 🧪 Test full workflow end-to-end
5. 🚀 Deploy to production

---

**Status:** ✅ Ready for Testing
**Time to Setup:** ~5 minutes
**Database Impact:** Non-breaking (adds new columns with defaults)

