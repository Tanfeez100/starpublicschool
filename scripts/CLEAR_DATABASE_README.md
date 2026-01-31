# Database Clear Script - Instructions

## Overview
Ye script database ka saara data delete kar deta hai, lekin **admin aur teacher ke login credentials preserve** rehte hain.

## ⚠️ WARNING
- **Ye script saara data delete kar degi!**
- Sirf authentication (admin/teacher login) preserve rahega
- Students, marks, fees, subjects - sab delete ho jayega
- Use karein jab fresh data insert karna ho

---

## Method 1: SQL Script (Supabase Dashboard)

### Steps:
1. Supabase Dashboard mein jao
2. **SQL Editor** open karo
3. `migrations/005_clear_all_data_keep_auth.sql` file ka content copy karo
4. SQL Editor mein paste karo
5. **Run** button click karo

### SQL Script Location:
```
school-management-backend/migrations/005_clear_all_data_keep_auth.sql
```

---

## Method 2: Node.js Script (Terminal)

### Steps:
1. Terminal mein project root directory mein jao:
   ```bash
   cd school-management-backend
   ```

2. Script run karo:
   ```bash
   node scripts/clear-database.js
   ```

### Requirements:
- `.env` file mein `SUPABASE_URL` aur `SUPABASE_SERVICE_KEY` set hona chahiye

---

## Kya Delete Hoga:

✅ **Delete Hoga:**
- `students` - Saare students
- `subjects` - Saare subjects (master list)
- `class_subjects` - Class-subject mappings
- `marks` - Saare marks
- `result_summary` - Result summaries
- `fees` - Fee records
- `fee_structure` - Fee structure (optional - script mein comment out kar sakte ho)
- `previous_dues` - Previous dues

❌ **Preserve Hoga (Delete Nahi Hoga):**
- `auth.users` - Supabase authentication users
- `user_roles` - Admin/Teacher roles

---

## Customization

### Subjects Master Data Preserve Karna:
Agar subjects ka master data preserve karna ho:

**SQL Script mein:**
```sql
-- Comment out this line:
-- DELETE FROM subjects;
```

**Node.js Script mein:**
```javascript
// Comment out "subjects" from tablesToClear array:
const tablesToClear = [
  "marks",
  "result_summary",
  "class_subjects",
  // "subjects", // ← Comment out this
  "fees",
  // ...
];
```

### Fee Structure Preserve Karna:
Agar fee structure preserve karna ho:

**SQL Script mein:**
```sql
-- Comment out this line:
-- DELETE FROM fee_structure;
```

**Node.js Script mein:**
```javascript
// Comment out "fee_structure" from tablesToClear array:
const tablesToClear = [
  // ...
  // "fee_structure", // ← Comment out this
  "students",
];
```

---

## Verification

Script run karne ke baad verify karo:

1. **Students check:**
   ```sql
   SELECT COUNT(*) FROM students;
   -- Should return 0
   ```

2. **Marks check:**
   ```sql
   SELECT COUNT(*) FROM marks;
   -- Should return 0
   ```

3. **Users check (should be preserved):**
   ```sql
   SELECT COUNT(*) FROM auth.users;
   -- Should return number of admin/teacher users
   ```

4. **Roles check (should be preserved):**
   ```sql
   SELECT COUNT(*) FROM user_roles;
   -- Should return number of admin/teacher roles
   ```

---

## After Clearing

Database clear karne ke baad:

1. ✅ Admin/Teacher login credentials preserved hain
2. ✅ Fresh data insert kar sakte ho
3. ✅ Subjects add kar sakte ho via API
4. ✅ Students add kar sakte ho via API
5. ✅ Marks submit kar sakte ho via API

---

## Troubleshooting

### Error: "relation does not exist"
- Table name check karo
- Supabase mein table exist karta hai ya nahi verify karo

### Error: "permission denied"
- `SUPABASE_SERVICE_KEY` use karo (not anon key)
- Service role key se hi delete operations ho sakti hain

### Error: "foreign key constraint"
- Tables ko correct order mein delete karo
- Child tables pehle, parent tables baad mein

---

## Safety Tips

1. **Backup le lo pehle:**
   - Supabase Dashboard se data export karo
   - Ya SQL dump le lo

2. **Test environment mein pehle try karo:**
   - Production mein directly mat chalao
   - Test database mein pehle verify karo

3. **Important data backup:**
   - Agar koi important data hai, pehle export karo
   - CSV ya JSON format mein save karo

---

## Support

Agar koi issue aaye:
1. Error message check karo
2. Supabase logs check karo
3. Table names verify karo
4. Permissions check karo

