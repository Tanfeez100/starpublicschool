import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(__dirname, `../backups/backup_before_cleanup_${timestamp}`);

fs.mkdirSync(backupDir, { recursive: true });

const tables = [
  "students",
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
  "month_closures",
  "fee_structures",
  "subjects",
  "class_subjects",
  "holiday_calendar",
  "teacher_profiles",
  "teacher_assignments",
  "teacher_attendance_settings",
  "teacher_attendance_records",
  "teacher_leave_requests",
  "teacher_attendance_audit_logs",
  "teacher_notifications",
  "user_sessions",
  "user_roles"
];

async function runBackup() {
  console.log(`Starting backup to: ${backupDir}`);
  const summary = {
    timestamp: new Date().toISOString(),
    supabaseUrl,
    tables: {},
    usersCount: 0
  };

  // 1. Backup auth.users
  try {
    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersErr) {
      console.error("Error backing up auth.users:", usersErr);
      summary.usersError = usersErr.message;
    } else {
      fs.writeFileSync(path.join(backupDir, "auth_users.json"), JSON.stringify(usersData.users, null, 2), "utf8");
      summary.usersCount = usersData.users.length;
      console.log(`Backed up auth.users (${usersData.users.length} users)`);
    }
  } catch (e) {
    console.error("Exception backing up auth users:", e);
  }

  // 2. Backup tables
  for (const table of tables) {
    try {
      let allRecords = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .range(from, from + batchSize - 1);

        if (error) {
          summary.tables[table] = { status: "error", error: error.message };
          console.warn(`Table ${table} error:`, error.message);
          hasMore = false;
          break;
        }

        if (data && data.length > 0) {
          allRecords = allRecords.concat(data);
          from += batchSize;
          if (data.length < batchSize) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }

      fs.writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify(allRecords, null, 2), "utf8");
      summary.tables[table] = { status: "success", count: allRecords.length };
      console.log(`Table ${table}: saved ${allRecords.length} records`);
    } catch (e) {
      summary.tables[table] = { status: "exception", error: e.message };
      console.error(`Exception backing up ${table}:`, e);
    }
  }

  fs.writeFileSync(path.join(backupDir, "backup_summary.json"), JSON.stringify(summary, null, 2), "utf8");
  console.log("Full backup completed successfully!");
}

runBackup();
