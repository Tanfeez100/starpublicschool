# Database Setup Instructions - Fee Management System

## 📋 Steps to Add New Tables to Database

### Option 1: Using Supabase SQL Editor (Recommended)

1. **Login to Supabase Dashboard**
   - Go to your Supabase project dashboard
   - Navigate to **SQL Editor** from the left sidebar

2. **Open Migration File**
   - Open the file: `migrations/006_create_fee_management_tables.sql`
   - Copy all the SQL code

3. **Run in SQL Editor**
   - Paste the SQL code in Supabase SQL Editor
   - Click **Run** button (or press Ctrl+Enter)
   - Wait for success message

4. **Verify Tables**
   - Go to **Table Editor** in Supabase
   - You should see these new tables:
     - ✅ `fee_structures`
     - ✅ `fee_bills`
     - ✅ `fee_bill_items`
     - ✅ `fee_payments`
     - ✅ `previous_dues`
     - ✅ `month_closures`

---

### Option 2: Using psql Command Line

```bash
# Connect to your Supabase database
psql -h <your-supabase-host> -U postgres -d postgres

# Run the migration file
\i migrations/006_create_fee_management_tables.sql
```

---

## 📊 Tables Created

### 1. **fee_structures**
- Stores fee structure definitions (class-wise, section-wise)
- Supports dynamic fee types (Tuition, Exam, Annual, Computer, Optional fees)
- Columns: `id`, `class`, `section`, `fee_name`, `fee_amount`, `is_optional`, `created_at`, `updated_at`

### 2. **fee_bills**
- Main bills table - one bill per student per month
- Columns: `id`, `student_id`, `month`, `year`, `total_amount`, `bill_status`, `created_at`, `updated_at`
- Foreign Key: `student_id` → `students(id)`
- Unique Constraint: `(student_id, month)` - prevents duplicate bills

### 3. **fee_bill_items**
- Individual fee items in each bill (normalized structure)
- Columns: `id`, `bill_id`, `fee_name`, `amount`, `created_at`
- Foreign Key: `bill_id` → `fee_bills(id)`

### 4. **fee_payments**
- Payment records for fee bills
- Supports multiple payments per bill
- Columns: `id`, `student_id`, `bill_id`, `amount_paid`, `payment_mode`, `payment_date`, `created_at`
- Foreign Keys: `student_id` → `students(id)`, `bill_id` → `fee_bills(id)`

### 5. **previous_dues**
- Previous month dues carried forward
- Columns: `id`, `student_id`, `amount`, `month`, `year`, `status`, `created_at`, `updated_at`
- Foreign Key: `student_id` → `students(id)`

### 6. **month_closures**
- Tracks closed months to prevent duplicate closing
- Columns: `id`, `month`, `year`, `closed_by`, `closed_at`
- Foreign Key: `closed_by` → `auth.users(id)`
- Unique Constraint: `month` - prevents duplicate month closing

---

## 🔍 Verification Queries

After running the migration, you can verify with these queries:

```sql
-- Check if all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'fee_structures',
  'fee_bills',
  'fee_bill_items',
  'fee_payments',
  'previous_dues',
  'month_closures'
)
ORDER BY table_name;

-- Check table structures
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN (
  'fee_structures',
  'fee_bills',
  'fee_bill_items',
  'fee_payments',
  'previous_dues',
  'month_closures'
)
ORDER BY table_name, ordinal_position;

-- Check indexes
SELECT 
  tablename,
  indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN (
  'fee_structures',
  'fee_bills',
  'fee_bill_items',
  'fee_payments',
  'previous_dues',
  'month_closures'
)
ORDER BY tablename, indexname;
```

---

## ⚠️ Important Notes

1. **Foreign Key Dependencies**
   - `fee_bills.student_id` requires `students` table to exist
   - `fee_payments.student_id` and `fee_payments.bill_id` require `students` and `fee_bills` tables
   - `month_closures.closed_by` requires `auth.users` table (Supabase default)

2. **Unique Constraints**
   - `fee_bills`: One bill per student per month
   - `month_closures`: One closure per month

3. **Cascade Deletes**
   - Deleting a student will delete all related bills, payments, and dues
   - Deleting a bill will delete all related bill items and payments

4. **Indexes**
   - All foreign keys are indexed for performance
   - Common query patterns are indexed (month, status, etc.)

---

## 🚀 After Setup

Once tables are created, you can:

1. **Start using the APIs:**
   - Create fee structures: `POST /api/fee-structure`
   - Generate bills: `POST /api/billing/generate-bulk`
   - Record payments: `POST /api/fees/pay`
   - Close months: `POST /api/fees/close-month`

2. **Test with Postman:**
   - Import `Postman_Collection.json`
   - Login first: `POST /api/auth/login`
   - Test all fee management APIs

---

## 📝 Sample Data (Optional)

You can insert sample fee structures:

```sql
-- Example: Create fee structure for Class 1, Section A
INSERT INTO fee_structures (class, section, fee_name, fee_amount, is_optional)
VALUES 
  ('1', 'A', 'Tuition Fee', 5000, false),
  ('1', 'A', 'Exam Fee', 500, true),
  ('1', 'A', 'Annual Fee', 1000, true),
  ('1', 'A', 'Computer Fee', 300, true),
  ('1', 'A', 'Library Fee', 200, true);
```

---

## ✅ Success Checklist

- [ ] All 6 tables created successfully
- [ ] All indexes created
- [ ] Foreign keys working
- [ ] Unique constraints applied
- [ ] Can insert test data
- [ ] APIs working correctly

---

**Need Help?** Check the `API_DOCUMENTATION.md` for API usage examples.

