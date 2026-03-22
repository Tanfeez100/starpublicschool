import { supabase } from "../services/supabase.js";
import { createBillsForClass } from "./bill.controller.js";
import XLSX from "xlsx";

const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

const toRawString = (value) =>
  typeof value === "string" ? value : "";

const parsePositiveInt = (value, fieldPath) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${fieldPath} must be a positive integer`);
  }
  return parsed;
};

const parseNonNegativeNumber = (value, fieldPath) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${fieldPath} must be a valid number`);
  }
  if (parsed < 0) {
    throw new ValidationError(`${fieldPath} cannot be negative`);
  }
  return parsed;
};

const getPreviousMonth = (month) => {
  const [yearPart, monthPart] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(yearPart, monthPart - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() - 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
};

const claimMigrationLock = async (migrationMonth) => {
  // First check if migration is already in progress or completed
  const { data: existing, error: existingError } = await supabase
    .from("migration_control")
    .select("migration_month, is_completed")
    .eq("migration_month", migrationMonth)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to validate migration lock: ${existingError.message}`);
  }

  if (existing) {
    if (existing.is_completed) {
      return { claimed: false, reason: "completed" };
    } else {
      return { claimed: false, reason: "in_progress" };
    }
  }

  // Try to create new lock
  const { data, error } = await supabase
    .from("migration_control")
    .insert({ migration_month: migrationMonth, is_completed: false })
    .select("migration_month, is_completed");

  if (error) {
    // If insert failed due to conflict, check again
    if (error.code === '23505') { // unique constraint violation
      const { data: recheck, error: recheckError } = await supabase
        .from("migration_control")
        .select("migration_month, is_completed")
        .eq("migration_month", migrationMonth)
        .maybeSingle();

      if (recheckError) {
        throw new Error(`Failed to recheck migration lock: ${recheckError.message}`);
      }

      if (recheck?.is_completed) {
        return { claimed: false, reason: "completed" };
      } else {
        return { claimed: false, reason: "in_progress" };
      }
    }
    throw new Error(`Failed to claim migration lock: ${error.message}`);
  }

  return { claimed: true };
};

const markMigrationCompleted = async (migrationMonth) => {
  const { data, error } = await supabase
    .from("migration_control")
    .update({ is_completed: true })
    .eq("migration_month", migrationMonth)
    .eq("is_completed", false)
    .select("migration_month");

  if (error) {
    throw new Error(`Failed to complete migration lock: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Migration lock row was not updated");
  }
};

const releaseMigrationLock = async (migrationMonth) => {
  const { error } = await supabase
    .from("migration_control")
    .delete()
    .eq("migration_month", migrationMonth)
    .eq("is_completed", false);

  if (error) {
    throw new Error(`Failed to release migration lock: ${error.message}`);
  }
};

export const releaseMigrationLockRoute = async (req, res) => {
  try {
    const { migration_month: migrationMonth } = req.body;

    if (!MONTH_REGEX.test(String(migrationMonth || ""))) {
      return res.status(400).json({
        message: "migration_month must be in YYYY-MM format",
      });
    }

    await releaseMigrationLock(migrationMonth);

    return res.json({
      message: `Migration lock released for ${migrationMonth}`,
    });
  } catch (error) {
    console.error("Release migration lock error:", error);
    return res.status(500).json({
      message: "Failed to release migration lock",
      error: error.message,
    });
  }
};

export const cancelMigrationRoute = async (req, res) => {
  try {
    const { migration_month: migrationMonth } = req.body;

    if (!MONTH_REGEX.test(String(migrationMonth || ""))) {
      return res.status(400).json({
        message: "migration_month must be in YYYY-MM format",
      });
    }

    // Force delete the migration lock regardless of completion status
    const { error } = await supabase
      .from("migration_control")
      .delete()
      .eq("migration_month", migrationMonth);

    if (error) {
      throw new Error(`Failed to cancel migration: ${error.message}`);
    }

    return res.json({
      message: `Migration cancelled for ${migrationMonth}`,
    });
  } catch (error) {
    console.error("Cancel migration error:", error);
    return res.status(500).json({
      message: "Failed to cancel migration",
      error: error.message,
    });
  }
};

const persistLogs = async (logs) => {
  if (!logs.length) return;

  try {
    const { error } = await supabase.from("migration_logs").insert(logs);

    if (error) {
      // Log the error but don't fail the migration if logging fails
      console.warn("⚠️ Warning: Failed to store migration logs:", error.message);
      console.warn("📝 Suggestion: Run 'node run_migration_009.js' to create migration_logs table");
      return; // Don't throw, just warn
    }
  } catch (error) {
    // Catch any other errors and just log them
    console.warn("⚠️ Warning: Migration logging failed:", error.message);
    console.warn("📝 Suggestion: Run 'node run_migration_009.js' to create migration_logs table");
  }
};

export const migrateOpeningBalance = async (req, res) => {
  let lockClaimed = false;

  req.setTimeout(120000);
  res.setTimeout(120000);

  try {
    const {
      migration_month: migrationMonth,
      class: classRaw,
      section: sectionRaw,
      students,
    } = req.body || {};

    const className = toRawString(classRaw);
    const section = toRawString(sectionRaw);

    if (!MONTH_REGEX.test(String(migrationMonth || ""))) {
      return res.status(400).json({
        message: "migration_month must be in YYYY-MM format",
      });
    }

    if (!className.trim() || !section.trim()) {
      return res.status(400).json({
        message: "class and section are required",
      });
    }

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        message: "students must be a non-empty array",
      });
    }

    const normalizedStudents = students.map((row, index) => {
      const rowPrefix = `students[${index}]`;

      return {
        roll_no: parsePositiveInt(row?.roll_no, `${rowPrefix}.roll_no`),
        current_month_total: parseNonNegativeNumber(
          row?.current_month_total,
          `${rowPrefix}.current_month_total`
        ),
        pending_due: parseNonNegativeNumber(
          row?.pending_due,
          `${rowPrefix}.pending_due`
        ),
        advance: parseNonNegativeNumber(row?.advance, `${rowPrefix}.advance`),
      };
    });

    const requestRolls = new Set();
    for (const row of normalizedStudents) {
      if (requestRolls.has(row.roll_no)) {
        return res.status(400).json({
          message: `Duplicate roll_no ${row.roll_no} found in request payload`,
        });
      }
      requestRolls.add(row.roll_no);
    }

    const lockResult = await claimMigrationLock(migrationMonth);

    if (!lockResult.claimed) {
      if (lockResult.reason === "completed") {
        return res.status(409).json({
          message: `Opening balance migration is already completed for ${migrationMonth}`,
        });
      }

      return res.status(409).json({
        message: `Opening balance migration for ${migrationMonth} is already in progress`,
      });
    }

    lockClaimed = true;

    const previousMonth = getPreviousMonth(migrationMonth);
    const rollNumbers = normalizedStudents.map((row) => row.roll_no);

    const { data: matchedStudents, error: studentError } = await supabase
      .from("students")
      .select("id, roll_no, section")
      .eq("class", className)
      .eq("section", section)
      .in("roll_no", rollNumbers);

    if (studentError) {
      throw new Error(`Failed to validate students: ${studentError.message}`);
    }

    const studentsByRoll = new Map();

    for (const student of matchedStudents || []) {
      const rollKey = Number(student.roll_no);
      if (!studentsByRoll.has(rollKey)) {
        studentsByRoll.set(rollKey, []);
      }
      studentsByRoll.get(rollKey).push(student);
    }

    for (const row of normalizedStudents) {
      const matches = studentsByRoll.get(row.roll_no) || [];

      if (matches.length > 1) {
        await releaseMigrationLock(migrationMonth);
        lockClaimed = false;

        return res.status(409).json({
          message: `Duplicate student found in Class ${className}, Section ${section} with Roll ${row.roll_no}`,
        });
      }
    }

    let duesInserted = 0;
    let advancesInserted = 0;
    let skippedStudents = 0;

    const errors = [];
    const logs = [];
    const migrationStudentData = new Map(); // Map student_id -> pending_due for bill generation

    for (const row of normalizedStudents) {
      const matches = studentsByRoll.get(row.roll_no) || [];

      if (matches.length === 0) {
        skippedStudents += 1;

        const notFoundMessage = `Student not found in Class ${className}, Section ${section}, Roll ${row.roll_no}`;
        errors.push({ roll_no: row.roll_no, error: notFoundMessage });

        logs.push({
          student_id: null,
          roll_no: row.roll_no,
          pending_due_inserted: 0,
          advance_inserted: 0,
          status: "skipped",
          error: notFoundMessage,
        });

        continue;
      }

      const student = matches[0];

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "fn_migrate_opening_balance_student",
        {
          p_student_id: student.id,
          p_pending_due: row.pending_due,
          p_advance: row.advance,
          p_previous_month: previousMonth,
          p_migration_month: migrationMonth,
        }
      );

      if (rpcError) {
        console.error(`RPC error for student ${student.roll_no}:`, rpcError);
        skippedStudents += 1;

        const rpcMessage = rpcError.message || "Failed to migrate student";
        errors.push({ roll_no: row.roll_no, error: rpcMessage });

        logs.push({
          student_id: student.id,
          roll_no: row.roll_no,
          pending_due_inserted: 0,
          advance_inserted: 0,
          status: "error",
          error: rpcMessage,
        });

        continue;
      }

      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      console.log(`Migration result for student ${student.roll_no}:`, result);

      const pendingDueInserted = Number(result?.pending_due_inserted || 0);
      const advanceInserted = Number(result?.advance_inserted || 0);

      // ✅ Store pending_due for bill generation (not in previous_dues table)
      if (pendingDueInserted > 0) {
        migrationStudentData.set(student.id, pendingDueInserted);
        duesInserted += 1;
      }

      if (advanceInserted > 0) {
        advancesInserted += 1;
      }

      logs.push({
        student_id: student.id,
        roll_no: row.roll_no,
        pending_due_inserted: pendingDueInserted,
        advance_inserted: advanceInserted,
        status: "success",
        error: null,
      });
    }

    await persistLogs(logs);

    // Integrated bill generation after migration to keep bill data consistent
    try {
      const billSummary = await createBillsForClass(className, migrationMonth, section, {
        include_exam_fee: true,
        include_annual_fee: true,
        include_computer_fee: true,
        migrationStudentData, // ✅ Pass migration data to bill generation
      });

      console.log("Post-migration bill generation summary:", billSummary);
    } catch (billError) {
      console.error("Bill generation after migration failed:", billError);
      // continue, but propagate to response (to help debugging)
      errors.push({ general: `Bill generation failed: ${billError.message}` });
    }

    await markMigrationCompleted(migrationMonth);
    lockClaimed = false;

    return res.json({
      total_processed: normalizedStudents.length,
      dues_inserted: duesInserted,
      advances_inserted: advancesInserted,
      skipped_students: skippedStudents,
      errors,
    });
  } catch (error) {
    console.error("Opening balance migration error:", error);

    if (lockClaimed && MONTH_REGEX.test(String(req.body?.migration_month || ""))) {
      try {
        await releaseMigrationLock(req.body.migration_month);
      } catch (releaseError) {
        console.error("Migration lock release failed:", releaseError);
      }
    }

    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(500).json({
      message: "Failed to migrate opening balance",
      error: error.message,
    });
  }
};

/**
 * Migrate opening balance from Excel file upload
 * POST /api/migration/from-excel
 * Accepts multipart/form-data with:
 *   - file: Excel file (.xlsx)
 *   - migration_month: YYYY-MM format
 */
export const migrateFromExcelFile = async (req, res) => {
  req.setTimeout(300000); // 5 minute timeout for large files
  res.setTimeout(300000);

  try {
    const { migration_month: migrationMonth } = req.body || {};
    const file = req.file;

    // Validate inputs
    if (!file) {
      return res.status(400).json({
        message: "Excel file is required",
      });
    }

    if (!MONTH_REGEX.test(String(migrationMonth || ""))) {
      return res.status(400).json({
        message: "migration_month must be in YYYY-MM format",
      });
    }

    // Read Excel file from buffer
    let workbook;
    try {
      workbook = XLSX.read(file.buffer, { type: "buffer" });
    } catch (parseError) {
      return res.status(400).json({
        message: "Failed to parse Excel file. Ensure it is a valid .xlsx file.",
        error: parseError.message,
      });
    }

    // Extract and group students by class and section
    const studentsByClassSection = {};
    const sheetCount = workbook.SheetNames.length;

    if (sheetCount === 0) {
      return res.status(400).json({
        message: "Excel file contains no sheets",
      });
    }

    console.log(`📋 Processing ${sheetCount} sheet(s) from Excel file`);

    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      console.log(`  Processing sheet: ${sheetName} (${data.length} rows)`);

      for (const row of data) {
        try {
          const className = String(row.class || "").trim();
          const section = String(row.section || "").trim();
          const rollNo = parseInt(row.roll_no);
          const pendingDue = parseFloat(row.pending_due) || 0;
          const advance = parseFloat(row.advance) || 0;
          const currentMonthTotal = parseFloat(row.current_month_total) || 0;

          // Validate required fields
          if (!className || !section || !rollNo || isNaN(rollNo)) {
            console.warn(`⚠️  Skipping row in sheet "${sheetName}":`, row);
            continue;
          }

          const key = `${className}_${section}`;
          if (!studentsByClassSection[key]) {
            studentsByClassSection[key] = {
              class: className,
              section: section,
              students: [],
            };
          }

          studentsByClassSection[key].students.push({
            roll_no: rollNo,
            pending_due: pendingDue,
            advance: advance,
            current_month_total: currentMonthTotal,
          });
        } catch (rowError) {
          console.warn(`⚠️  Error processing row in sheet "${sheetName}":`, rowError.message);
          continue;
        }
      }
    }

    const classKeys = Object.keys(studentsByClassSection);
    if (classKeys.length === 0) {
      return res.status(400).json({
        message: "No valid student data found in Excel file",
      });
    }

    console.log(`\n📊 Found ${classKeys.length} class/section combination(s)`);

    // ✅ FIX: Claim lock ONCE for entire batch
    const lockResult = await claimMigrationLock(migrationMonth);

    if (!lockResult.claimed) {
      const reason = lockResult.reason === "completed" ? "already completed" : "already in progress";
      return res.status(409).json({
        success: false,
        message: `Opening balance migration for ${migrationMonth} is ${reason}`,
      });
    }

    try {
      // Process all sections with lock held
      const results = [];
      let totalMigrated = 0;
      let totalErrors = 0;

      for (const key of classKeys) {
        const { class: className, section, students } = studentsByClassSection[key];

        console.log(`\n📤 Migrating Class ${className}, Section ${section} (${students.length} students)...`);

        try {
          // Normalize students
          const normalizedStudents = [];
          for (const row of students) {
            try {
              normalizedStudents.push({
                roll_no: parsePositiveInt(row.roll_no, `students_${className}_${section}.roll_no`),
                current_month_total: parseNonNegativeNumber(
                  row.current_month_total,
                  `students_${className}_${section}.current_month_total`
                ),
                pending_due: parseNonNegativeNumber(
                  row.pending_due,
                  `students_${className}_${section}.pending_due`
                ),
                advance: parseNonNegativeNumber(
                  row.advance,
                  `students_${className}_${section}.advance`
                ),
              });
            } catch (validationError) {
              console.warn(`⚠️  Skipping invalid row in ${className}_${section}:`, row);
              totalErrors += 1;
            }
          }

          if (normalizedStudents.length === 0) {
            results.push({
              class: className,
              section: section,
              status: "FAILED",
              students_processed: 0,
              message: "No valid students",
            });
            continue;
          }

          const previousMonth = getPreviousMonth(migrationMonth);
          const rollNumbers = normalizedStudents.map((row) => row.roll_no);

          const { data: matchedStudents, error: studentError } = await supabase
            .from("students")
            .select("id, roll_no, section")
            .eq("class", className)
            .eq("section", section)
            .in("roll_no", rollNumbers);

          if (studentError) {
            results.push({
              class: className,
              section: section,
              status: "FAILED",
              students_processed: students.length,
              message: `Failed to fetch students: ${studentError.message}`,
            });
            continue;
          }

          const studentsByRoll = new Map();
          for (const student of matchedStudents || []) {
            const rollKey = Number(student.roll_no);
            if (!studentsByRoll.has(rollKey)) {
              studentsByRoll.set(rollKey, []);
            }
            studentsByRoll.get(rollKey).push(student);
          }

          let duesInserted = 0;
          let advancesInserted = 0;
          let skippedStudents = 0;
          const errors = [];
          const logs = [];
          const migrationStudentData = new Map(); // Map student_id -> pending_due for bill generation

          for (const row of normalizedStudents) {
            const matches = studentsByRoll.get(row.roll_no) || [];

            if (matches.length > 1) {
              skippedStudents += 1;
              errors.push({
                roll_no: row.roll_no,
                error: `Duplicate student`,
              });
              continue;
            }

            if (matches.length === 0) {
              skippedStudents += 1;
              errors.push({
                roll_no: row.roll_no,
                error: `Student not found`,
              });
              logs.push({
                student_id: null,
                roll_no: row.roll_no,
                pending_due_inserted: 0,
                advance_inserted: 0,
                status: "skipped",
                error: `Not found`,
              });
              continue;
            }

            const student = matches[0];
            const { data: rpcData, error: rpcError } = await supabase.rpc(
              "fn_migrate_opening_balance_student",
              {
                p_student_id: student.id,
                p_pending_due: row.pending_due,
                p_advance: row.advance,
                p_previous_month: previousMonth,
                p_migration_month: migrationMonth,
              }
            );

            if (rpcError) {
              skippedStudents += 1;
              errors.push({
                roll_no: row.roll_no,
                error: rpcError.message,
              });
              logs.push({
                student_id: student.id,
                roll_no: row.roll_no,
                pending_due_inserted: 0,
                advance_inserted: 0,
                status: "error",
                error: rpcError.message,
              });
              continue;
            }

            const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
            const pendingDueInserted = Number(result?.pending_due_inserted || 0);
            const advanceInserted = Number(result?.advance_inserted || 0);

            // ✅ Store pending_due for bill generation (not in previous_dues table)
            if (pendingDueInserted > 0) {
              migrationStudentData.set(student.id, pendingDueInserted);
              duesInserted += 1;
            }

            if (advanceInserted > 0) advancesInserted += 1;

            logs.push({
              student_id: student.id,
              roll_no: row.roll_no,
              pending_due_inserted: pendingDueInserted,
              advance_inserted: advanceInserted,
              status: "success",
              error: null,
            });
          }

          await persistLogs(logs);

          try {
            await createBillsForClass(className, migrationMonth, section, {
              include_exam_fee: true,
              include_annual_fee: true,
              include_computer_fee: true,
              migrationStudentData, // ✅ Pass migration data to bill generation
            });
          } catch (billError) {
            console.error(`Bill generation failed for ${className}_${section}:`, billError.message);
          }

          totalMigrated += normalizedStudents.length - skippedStudents;
          results.push({
            class: className,
            section: section,
            status: "SUCCESS",
            students_processed: normalizedStudents.length,
            dues_inserted: duesInserted,
            advances_inserted: advancesInserted,
            skipped: skippedStudents,
            errors: errors.length > 0 ? errors : [],
          });
        } catch (sectionError) {
          console.error(`Error migrating ${className}_${section}:`, sectionError.message);
          results.push({
            class: className,
            section: section,
           status: "FAILED",
            students_processed: students.length,
            message: sectionError.message,
          });
        }
      }

      // ✅ FIX: Release lock ONCE after ALL sections
      await markMigrationCompleted(migrationMonth);

      return res.json({
        success: true,
        message: "Migration completed from Excel file",
        migration_month: migrationMonth,
        sheets_processed: sheetCount,
        class_sections_processed: classKeys.length,
        total_migrated: totalMigrated,
        total_errors: totalErrors,
        results,
      });
    } catch (error) {
      console.error("Excel batch error:", error.message);

      try {
        await markMigrationCompleted(migrationMonth);
      } catch (releaseError) {
        console.error("Lock release failed:", releaseError.message);
      }

      return res.status(500).json({
        success: false,
        message: "Failed to process Excel file",
        error: error.message,
      });
    }
  } catch (error) {
    console.error("Excel file migration error:", error);

    return res.status(500).json({
      message: "Failed to process Excel file migration",
      error: error.message,
    });
  }
};
