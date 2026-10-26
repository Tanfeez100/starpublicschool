import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exportDir = path.join(__dirname, "../data/db_export");

// Parse arguments from CLI: --target-url=... --target-key=...
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith("--")) {
      const [key, ...values] = arg.slice(2).split("=");
      args[key] = values.join("=");
    }
  });
  return args;
}

const args = parseArgs();
const targetUrl = args["target-url"] || process.env.TARGET_SUPABASE_URL;
const targetKey = args["target-key"] || process.env.TARGET_SUPABASE_SERVICE_KEY;

if (!targetUrl || !targetKey) {
  console.log("=================================================================");
  console.log("❌ ERROR: Target database credentials missing!");
  console.log("=================================================================");
  console.log("Run the migration with your new database credentials like this:");
  console.log("");
  console.log("node scripts/migrate-direct.js --target-url=https://jhzqcbelnrjgtfkcgavj.supabase.co --target-key=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoenFjYmVsbnJqZ3Rma2NnYXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzAwNDQ4MiwiZXhwIjoyMTA4NTgwNDgyfQ.u964Guf5dynLCVbgIcB1i8kiaLwhDISqEtd7uWh5IBk");
  console.log("");
  console.log("Or put them in .env as:");
  console.log("TARGET_SUPABASE_URL=https://");
  console.log("TARGET_SUPABASE_SERVICE_KEY=eyJ...");
  console.log("=================================================================");
  process.exit(1);
}

const targetSupabase = createClient(targetUrl, targetKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Table insertion order respecting Foreign Keys
const INSERTION_ORDER = [
  "subjects",
  "class_subjects",
  "students",
  "teacher_profiles",
  "teacher_assignments",
  "user_roles",
  "marks",
  "previous_dues",
  "advance_ledger",
  "timetable_settings",
  "timetable_periods",
  "timetable_entries",
  "timetable_substitutions",
  "timetable_audit_logs",
];

async function migrateDirect() {
  console.log("=================================================");
  console.log("🚀 STARTING DIRECT DATABASE MIGRATION TO NEW DB");
  console.log("Target URL:", targetUrl);
  console.log("=================================================");

  // Step 1: Migrate Auth Users
  const authUsersFile = path.join(exportDir, "auth_users.json");
  if (fs.existsSync(authUsersFile)) {
    try {
      const authUsers = JSON.parse(fs.readFileSync(authUsersFile, "utf-8"));
      console.log(`\n🔑 Migrating ${authUsers.length} Auth Users...`);

      for (const u of authUsers) {
        if (!u.email) continue;
        try {
          const { error } = await targetSupabase.auth.admin.createUser({
            id: u.id,
            email: u.email,
            email_confirm: true,
            user_metadata: u.user_metadata || {},
            password: "SpsPassword@2026", // Default fallback password if needed
          });

          if (error && !error.message.includes("already")) {
            console.warn(`  ⚠️ User '${u.email}' notice:`, error.message);
          } else {
            console.log(`  ✅ User '${u.email}' created.`);
          }
        } catch (e) {
          console.warn(`  ⚠️ User '${u.email}' skipped:`, e.message);
        }
      }
    } catch (e) {
      console.warn("⚠️ Auth user migration error:", e.message);
    }
  }

  // Step 2: Migrate Table Records in safe batches
  for (const table of INSERTION_ORDER) {
    const tableFile = path.join(exportDir, `${table}.json`);
    if (!fs.existsSync(tableFile)) {
      continue;
    }

    try {
      const records = JSON.parse(fs.readFileSync(tableFile, "utf-8"));
      if (!Array.isArray(records) || records.length === 0) {
        console.log(`\n⏭️ Table '${table}': 0 records (skipped).`);
        continue;
      }

      console.log(`\n📦 Migrating table '${table}' (${records.length} records)...`);
      const batchSize = 100;
      let insertedCount = 0;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const { error } = await targetSupabase
          .from(table)
          .upsert(batch, { onConflict: "id", ignoreDuplicates: false });

        if (error) {
          console.warn(`  ⚠️ Batch ${i}-${i + batch.length} in '${table}' error:`, error.message);
        } else {
          insertedCount += batch.length;
        }
      }

      console.log(`  ✅ Table '${table}' finished: ${insertedCount}/${records.length} records migrated.`);
    } catch (err) {
      console.warn(`  ⚠️ Error migrating table '${table}':`, err.message);
    }
  }

  console.log("\n=================================================");
  console.log("🎉 DIRECT DATABASE MIGRATION COMPLETED SUCCESSFULLY!");
  console.log("=================================================");
  console.log("Next Step: Update your .env file with the new database keys:");
  console.log(`SUPABASE_URL=${targetUrl}`);
  console.log(`SUPABASE_SERVICE_KEY=${targetKey.slice(0, 15)}...`);
  console.log("=================================================");
}

migrateDirect()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
