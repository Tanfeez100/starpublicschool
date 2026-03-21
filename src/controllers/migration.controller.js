import { supabase } from "../services/supabase.js";

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
  const { data, error } = await supabase
    .from("migration_control")
    .upsert(
      { migration_month: migrationMonth, is_completed: false },
      { onConflict: "migration_month", ignoreDuplicates: true }
    )
    .select("migration_month, is_completed");

  if (error) {
    throw new Error(`Failed to claim migration lock: ${error.message}`);
  }

  if (Array.isArray(data) && data.length > 0) {
    return { claimed: true };
  }

  const { data: existing, error: existingError } = await supabase
    .from("migration_control")
    .select("migration_month, is_completed")
    .eq("migration_month", migrationMonth)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to validate migration lock: ${existingError.message}`);
  }

  if (existing?.is_completed) {
    return { claimed: false, reason: "completed" };
  }

  return { claimed: false, reason: "in_progress" };
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

const persistLogs = async (logs) => {
  if (!logs.length) return;

  const { error } = await supabase.from("migration_logs").insert(logs);

  if (error) {
    throw new Error(`Failed to store migration logs: ${error.message}`);
  }
};

export const migrateOpeningBalance = async (req, res) => {
  let lockClaimed = false;

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
      .select("id, roll_no")
      .eq("class", className)
      .eq("section", section)
      .eq("is_deleted", false)
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
          message: `Duplicate student found for class=${className}, section=${section}, roll_no=${row.roll_no}`,
        });
      }
    }

    let duesInserted = 0;
    let advancesInserted = 0;
    let skippedStudents = 0;

    const errors = [];
    const logs = [];

    for (const row of normalizedStudents) {
      const matches = studentsByRoll.get(row.roll_no) || [];

      if (matches.length === 0) {
        skippedStudents += 1;

        const notFoundMessage = "Student not found (class/section mismatch)";
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

      const pendingDueInserted = Number(result?.pending_due_inserted || 0);
      const advanceInserted = Number(result?.advance_inserted || 0);

      if (pendingDueInserted > 0) {
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
