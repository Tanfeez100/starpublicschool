import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function finalAudit() {
  console.log("=========================================");
  console.log("📊 SUPABASE DATABASE AUDIT REPORT");
  console.log("=========================================\n");

  console.log("1. AUTH USERS (auth.users):");
  const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers();
  if (usersErr) {
    console.error("Error:", usersErr);
  } else {
    console.log(`Total Auth Users: ${usersData.users.length}`);
    usersData.users.forEach(u => {
      console.log(`  - Email: ${u.email} | ID: ${u.id} | Confirmed: ${u.email_confirmed_at ? 'Yes' : 'No'}`);
    });
  }

  console.log("\n2. USER ROLES (public.user_roles):");
  const { data: roles } = await supabase.from("user_roles").select("*");
  console.log(roles);

  console.log("\n3. STUDENT & TRANSACTION TABLES:");
  const studentTables = [
    "students",
    "roll_history",
    "student_auth",
    "student_leave_requests",
    "student_notifications",
    "student_push_tokens",
    "attendance_records",
    "marks",
    "result_summary",
    "fee_bills",
    "fee_bill_items",
    "fee_payments",
    "previous_dues",
    "advance_ledger",
    "month_closures"
  ];

  for (const t of studentTables) {
    const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
    console.log(`  - ${t}: ${count ?? 'N/A'} rows ${error ? '(' + error.message + ')' : ''}`);
  }

  console.log("\n4. TEACHER DATA TABLES:");
  const teacherTables = [
    "teacher_profiles",
    "teacher_assignments",
    "teacher_attendance_records",
    "teacher_attendance_settings",
    "teacher_attendance_audit_logs",
    "teacher_leave_requests",
    "teacher_notifications"
  ];

  for (const t of teacherTables) {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
    console.log(`  - ${t}: ${count} rows`);
  }

  console.log("\n5. SYSTEM / CONFIG MASTER TABLES (Preserved):");
  const configTables = [
    "subjects",
    "class_subjects",
    "fee_structures",
    "holiday_calendar"
  ];

  for (const t of configTables) {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
    console.log(`  - ${t}: ${count} rows`);
  }

  console.log("\n=========================================");
  console.log("AUDIT COMPLETE");
  console.log("=========================================");
}

finalAudit();
