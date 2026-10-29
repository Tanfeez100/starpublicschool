import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ALLOWED_EMAILS = [
  "a9006457330@gmail.com",
  "ta2nfeez@gmail.com"
];

// Helper to batch-delete all rows from a table by primary key (id or custom key)
async function deleteEntireTable(tableName, idCol = "id") {
  try {
    const { data: records, error: fetchErr } = await supabase
      .from(tableName)
      .select(idCol)
      .limit(10000);

    if (fetchErr) {
      console.error(`❌ Error fetching ${tableName}:`, fetchErr.message);
      return 0;
    }

    if (!records || records.length === 0) {
      console.log(`ℹ️  Table ${tableName} is already empty.`);
      return 0;
    }

    console.log(`🗑️  Deleting ${records.length} records from ${tableName}...`);
    const batchSize = 100;
    let deletedCount = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const ids = batch.map((r) => r[idCol]);

      const { error: delErr } = await supabase
        .from(tableName)
        .delete()
        .in(idCol, ids);

      if (delErr) {
        console.error(`❌ Error deleting batch from ${tableName}:`, delErr.message);
        break;
      }
      deletedCount += batch.length;
    }

    console.log(`✅ Cleared ${tableName} (${deletedCount} records deleted).`);
    return deletedCount;
  } catch (err) {
    console.error(`❌ Exception in deleteEntireTable(${tableName}):`, err.message);
    return 0;
  }
}

async function performCleanup() {
  console.log("=================================================");
  console.log("🧹 STARTING DATABASE CLEANUP");
  console.log("Allowed admin logins to keep:", ALLOWED_EMAILS);
  console.log("=================================================\n");

  // Step 1: Clean teacher/staff records that would block user deletion
  console.log("--- Step 1: Cleaning Teacher Audit/Attendance/Assignment Records ---");
  await deleteEntireTable("teacher_attendance_audit_logs");
  await deleteEntireTable("teacher_leave_requests");
  await deleteEntireTable("teacher_attendance_records");
  await deleteEntireTable("teacher_assignments");
  await deleteEntireTable("teacher_attendance_settings");
  await deleteEntireTable("teacher_profiles");
  await deleteEntireTable("teacher_notifications");

  // Step 2: Clean student data tables in order
  console.log("\n--- Step 2: Cleaning All Student Data Records ---");
  await deleteEntireTable("student_leave_requests");
  await deleteEntireTable("student_notifications");
  await deleteEntireTable("student_push_tokens");
  await deleteEntireTable("student_auth", "student_id");
  await deleteEntireTable("attendance_records");
  await deleteEntireTable("marks");
  await deleteEntireTable("result_summary");
  await deleteEntireTable("fee_bill_items");
  await deleteEntireTable("fee_bills");
  await deleteEntireTable("fee_payments");
  await deleteEntireTable("previous_dues");
  await deleteEntireTable("advance_ledger");
  await deleteEntireTable("month_closures");
  await deleteEntireTable("students");

  // Step 3: Clean User Sessions
  console.log("\n--- Step 3: Cleaning User Sessions ---");
  await deleteEntireTable("user_sessions");

  // Step 4: Clean Auth Users and User Roles
  console.log("\n--- Step 4: Cleaning Auth Users (except allowed logins) ---");
  const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (usersErr) {
    console.error("❌ Failed to list auth users:", usersErr.message);
  } else {
    const allUsers = usersData.users;
    console.log(`Found ${allUsers.length} total users in auth.users.`);

    for (const u of allUsers) {
      const email = (u.email || "").toLowerCase().trim();
      if (ALLOWED_EMAILS.includes(email)) {
        console.log(`  🔒 PRESERVING USER: ${email} (ID: ${u.id})`);
        // Ensure user role is 'admin'
        const { error: roleErr } = await supabase
          .from("user_roles")
          .upsert({ user_id: u.id, role: "admin" }, { onConflict: "user_id" });
        if (roleErr) {
          console.warn(`    ⚠️ Could not set admin role:`, roleErr.message);
        } else {
          console.log(`    ✅ Admin role confirmed.`);
        }
      } else {
        console.log(`  🗑️ DELETING USER: ${email || u.id}`);

        // Delete from user_roles first if present
        await supabase.from("user_roles").delete().eq("user_id", u.id);

        // Delete from auth.users
        const { error: delUserErr } = await supabase.auth.admin.deleteUser(u.id);
        if (delUserErr) {
          console.error(`    ❌ Error deleting user ${email}:`, delUserErr.message);
        } else {
          console.log(`    ✅ Deleted user ${email} successfully.`);
        }
      }
    }
  }

  // Step 5: Final Verification
  console.log("\n=================================================");
  console.log("🔍 FINAL VERIFICATION POST-CLEANUP");
  console.log("=================================================");

  // Check remaining auth users
  const { data: finalUsers } = await supabase.auth.admin.listUsers();
  console.log(`Remaining auth users (${finalUsers?.users?.length || 0}):`);
  finalUsers?.users?.forEach((u) => {
    console.log(`  - ${u.email} (ID: ${u.id})`);
  });

  // Check user_roles
  const { data: finalRoles } = await supabase.from("user_roles").select("*");
  console.log("\nRemaining user_roles:", finalRoles);

  // Check students count
  const { count: finalStudentsCount } = await supabase.from("students").select("*", { count: "exact", head: true });
  console.log(`\nRemaining students count: ${finalStudentsCount}`);

  // Check student related tables
  const verificationTables = [
    "students",
    "student_auth",
    "student_leave_requests",
    "student_notifications",
    "attendance_records",
    "marks",
    "result_summary",
    "fee_bills",
    "fee_bill_items",
    "fee_payments",
    "previous_dues",
    "advance_ledger",
    "month_closures",
    "teacher_profiles",
    "teacher_assignments",
    "teacher_attendance_records",
    "subjects",
    "fee_structures"
  ];

  console.log("\nTable counts summary:");
  for (const t of verificationTables) {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
    console.log(`  - ${t}: ${count} rows`);
  }

  console.log("\n🎉 CLEANUP COMPLETED SUCCESSFULLY!");
}

performCleanup();
