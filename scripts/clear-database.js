/**
 * Clear All Database Data - Keep Admin & Teacher Login
 * 
 * This script deletes all data from the database
 * while preserving admin and teacher authentication.
 * 
 * WARNING: This will delete ALL data except user authentication!
 * 
 * Usage:
 *   node scripts/clear-database.js
 * 
 * Or with environment variables:
 *   SUPABASE_URL=your_url SUPABASE_SERVICE_KEY=your_key node scripts/clear-database.js
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env file");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Tables to clear (in order to respect foreign key constraints)
const tablesToClear = [
  "marks",
  "result_summary",
  "class_subjects",
  "subjects", // Comment out if you want to keep subject master data
  "fees",
  "previous_dues",
  "fee_structure", // Comment out if you want to keep fee structure
  "students",
];

// Tables to preserve (DO NOT DELETE)
const tablesToPreserve = [
  "auth.users", // Supabase authentication
  "user_roles", // Admin/Teacher roles
];

async function clearDatabase() {
  console.log("🗑️  Starting database cleanup...\n");
  console.log("⚠️  WARNING: This will delete ALL data except authentication!\n");

  try {
    // Show current counts before deletion
    console.log("📊 Current data counts:");
    for (const table of tablesToClear) {
      try {
        const { count, error } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true });
        
        if (!error) {
          console.log(`   ${table}: ${count || 0} records`);
        }
      } catch (err) {
        console.log(`   ${table}: Error checking count`);
      }
    }

    console.log("\n🗑️  Deleting data...\n");

    // Delete from each table
    // Note: Supabase client may have RLS restrictions, so SQL script is recommended
    for (const table of tablesToClear) {
      try {
        // First, get all IDs to delete
        const { data: allRecords, error: fetchError } = await supabase
          .from(table)
          .select("id")
          .limit(10000); // Limit to prevent memory issues
        
        if (fetchError) {
          console.error(`❌ Error fetching from ${table}:`, fetchError.message);
          console.log(`   💡 Tip: Use SQL script in Supabase Dashboard`);
          continue;
        }

        if (!allRecords || allRecords.length === 0) {
          console.log(`✅ ${table} is already empty`);
          continue;
        }

        // Delete in batches if needed
        const batchSize = 100;
        let deletedCount = 0;

        for (let i = 0; i < allRecords.length; i += batchSize) {
          const batch = allRecords.slice(i, i + batchSize);
          const ids = batch.map(r => r.id);

          const { error: deleteError } = await supabase
            .from(table)
            .delete()
            .in("id", ids);

          if (deleteError) {
            console.error(`❌ Error deleting batch from ${table}:`, deleteError.message);
            console.log(`   💡 Tip: Use SQL script in Supabase Dashboard for bulk delete`);
            break;
          } else {
            deletedCount += batch.length;
          }
        }

        if (deletedCount > 0) {
          console.log(`✅ Cleared ${table} (${deletedCount} records)`);
        }
      } catch (err) {
        console.error(`❌ Error deleting from ${table}:`, err.message);
        console.log(`   💡 Tip: Use SQL script in Supabase Dashboard`);
      }
    }

    // Verify preserved tables
    console.log("\n✅ Preserved tables (not deleted):");
    for (const table of tablesToPreserve) {
      try {
        if (table === "auth.users") {
          // Check auth.users via admin API
          const { data: { users }, error } = await supabase.auth.admin.listUsers();
          if (!error) {
            console.log(`   ${table}: ${users?.length || 0} users`);
          }
        } else {
          const { count, error } = await supabase
            .from(table)
            .select("*", { count: "exact", head: true });
          
          if (!error) {
            console.log(`   ${table}: ${count || 0} records`);
          }
        }
      } catch (err) {
        console.log(`   ${table}: Error checking count`);
      }
    }

    console.log("\n✅ Database cleanup completed!");
    console.log("📝 All data cleared except admin and teacher authentication.");
    console.log("🔐 Login credentials are preserved.");

  } catch (err) {
    console.error("❌ Fatal error:", err);
    process.exit(1);
  }
}

// Run the cleanup
clearDatabase();

