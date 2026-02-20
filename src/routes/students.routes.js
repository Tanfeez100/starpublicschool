import express from "express";
import { supabase } from "../services/supabase.js";
import { adminOrTeacher, adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

const STUDENT_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
};

const ROLL_CONFLICT_ERROR_CODE = "ROLL_CONFLICT";
const ACADEMIC_YEAR_REGEX = /^\d{4}-(\d{2}|\d{4})$/;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const sanitizeString = (value) =>
  typeof value === "string" ? value.trim() : value;

const isUniqueViolation = (error) =>
  error?.code === "23505" ||
  String(error?.message || "").toLowerCase().includes("duplicate key");

const isValidUuid = (value) => UUID_REGEX.test(String(value || ""));

const getDefaultAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${currentYear}-${String(currentYear + 1).slice(-2)}`;
};

const normalizeAcademicYear = (value, { required = false } = {}) => {
  const normalized = sanitizeString(value);
  if (!normalized) {
    if (required) {
      throw new Error("academic_year is required");
    }
    return null;
  }

  if (!ACADEMIC_YEAR_REGEX.test(normalized)) {
    throw new Error("academic_year must be in format YYYY-YY or YYYY-YYYY");
  }

  return normalized;
};

const normalizeRollNo = (value, { required = false } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new Error("roll_no is required");
    }
    return null;
  }

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized) || Number(normalized) <= 0) {
    throw new Error("roll_no must be a positive numeric value");
  }

  return normalized;
};

const normalizeStatus = (value, { required = false } = {}) => {
  const normalized = sanitizeString(value);
  if (!normalized) {
    if (required) {
      throw new Error("status is required");
    }
    return null;
  }

  const lowered = normalized.toLowerCase();
  if (lowered !== STUDENT_STATUS.ACTIVE && lowered !== STUDENT_STATUS.INACTIVE) {
    throw new Error("status must be 'active' or 'inactive'");
  }

  return lowered;
};

const normalizeDateOnly = (value, { required = false, field = "date" } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new Error(`${field} is required`);
    }
    return null;
  }

  const input = sanitizeString(value);
  const dt = new Date(input);
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }

  return dt.toISOString().split("T")[0];
};

const buildRollConflictMessage = (className, section, academicYear, rollNo) =>
  `Roll ${rollNo} is already assigned to an active student in class "${className}", section "${section}", academic year "${academicYear}"`;

const checkRollConflictForActiveStudent = async ({
  className,
  section,
  academicYear,
  rollNo,
  excludeStudentId,
}) => {
  let query = supabase
    .from("students")
    .select("id, name")
    .eq("class", className)
    .eq("section", section)
    .eq("academic_year", academicYear)
    .eq("roll_no", rollNo)
    .eq("status", STUDENT_STATUS.ACTIVE)
    .limit(1);

  if (excludeStudentId) {
    query = query.neq("id", excludeStudentId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to validate roll number: ${error.message}`);
  }

  return Array.isArray(data) && data.length > 0;
};

const parseBooleanQuery = (value, defaultValue = false) => {
  if (value === undefined) return defaultValue;
  if (typeof value === "boolean") return value;
  const lowered = String(value).trim().toLowerCase();
  return lowered === "1" || lowered === "true" || lowered === "yes";
};

const normalizeOptionalTransport = (value) => {
  if (typeof value === "undefined") return undefined;
  return Boolean(value);
};

/* ===============================
   GET ALL STUDENT DETAILS
   Admin & Teacher
   =============================== */
router.get("/all", adminOrTeacher, async (req, res) => {
  try {
    const {
      class: cls,
      section,
      academic_year: academicYearRaw,
      status: statusRaw,
      include_inactive,
    } = req.query;

    const includeInactive = parseBooleanQuery(include_inactive, false);
    const academicYear = normalizeAcademicYear(academicYearRaw);
    const status = normalizeStatus(statusRaw);

    let query = supabase
      .from("students")
      .select(
        "id, name, father_name, mother_name, gender, class, section, roll_no, academic_year, status, left_date, mobile, address, uses_transport, transport_charge"
      )
      .order("class", { ascending: true })
      .order("section", { ascending: true })
      .order("roll_no", { ascending: true });

    if (cls) query = query.eq("class", String(cls).trim());
    if (section) query = query.eq("section", String(section).trim());
    if (academicYear) query = query.eq("academic_year", academicYear);

    if (status) {
      query = query.eq("status", status);
    } else if (!includeInactive) {
      query = query.eq("status", STUDENT_STATUS.ACTIVE);
    }

    const { data: students, error } = await query;

    if (error) {
      return res.status(500).json({
        message: "Failed to fetch students",
        error: error.message,
      });
    }

    const formattedStudents = (students || []).map((student) => ({
      ID: student.id || "",
      Name: student.name || "",
      Father: student.father_name || "",
      Mother: student.mother_name || "",
      Gender: student.gender || "",
      Class: student.class || "",
      Section: student.section || "",
      Roll: student.roll_no || "",
      AcademicYear: student.academic_year || "",
      Status: student.status || "",
      LeftDate: student.left_date || "",
      Mobile: student.mobile || "",
      Address: student.address || "",
      Transport: student.uses_transport
        ? student.transport_charge || "Yes"
        : "No",
    }));

    res.json({
      success: true,
      count: formattedStudents.length,
      students: formattedStudents,
    });
  } catch (err) {
    console.error("Get all students error:", err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
});

/* ===============================
   GET CLASSES & SECTIONS
   Admin & Teacher
   =============================== */
router.get("/classes", adminOrTeacher, async (req, res) => {
  try {
    const includeInactive = parseBooleanQuery(req.query.include_inactive, false);

    let query = supabase
      .from("students")
      .select("class, section")
      .order("class", { ascending: true })
      .order("section", { ascending: true });

    if (!includeInactive) {
      query = query.eq("status", STUDENT_STATUS.ACTIVE);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ message: error.message });

    const classesMap = {};
    (data || []).forEach((row) => {
      const cls = row.class || "";
      const sec = row.section || null;
      if (!classesMap[cls]) classesMap[cls] = new Set();
      if (sec) classesMap[cls].add(sec);
    });

    const classesArray = Object.keys(classesMap).filter((c) => c !== "");
    const sectionsMap = {};
    classesArray.forEach((c) => {
      sectionsMap[c] = Array.from(classesMap[c]);
    });

    const classesWithSections = classesArray.map((c) => ({
      class: c,
      sections: sectionsMap[c],
    }));

    res.json({
      success: true,
      classes: classesArray,
      sections_map: sectionsMap,
      classes_with_sections: classesWithSections,
    });
  } catch (err) {
    console.error("GET /classes error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* ===============================
   GET STUDENT LIST (BULK BILL)
   Admin & Teacher
   =============================== */
router.get("/", adminOrTeacher, async (req, res) => {
  try {
    const {
      class: cls,
      section,
      academic_year: academicYearRaw,
      include_inactive,
    } = req.query;

    if (!cls) {
      return res.status(400).json({ message: "class is required" });
    }

    const includeInactive = parseBooleanQuery(include_inactive, false);
    const academicYear = normalizeAcademicYear(academicYearRaw);

    let query = supabase
      .from("students")
      .select(
        "id, name, father_name, mobile, address, class, roll_no, section, academic_year, status, left_date, uses_transport"
      )
      .eq("class", String(cls).trim())
      .order("roll_no");

    if (section) query = query.eq("section", String(section).trim());
    if (academicYear) query = query.eq("academic_year", academicYear);
    if (!includeInactive) query = query.eq("status", STUDENT_STATUS.ACTIVE);

    const { data: students, error } = await query;

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    const studentIds = (students || []).map((s) => s.id);

    const { data: allDuesRows } = await supabase
      .from("previous_dues")
      .select("student_id, remaining_due")
      .in("student_id", studentIds)
      .eq("status", "pending")
      .eq("cleared", false);

    const previousDuesMap = {};
    (allDuesRows || []).forEach((d) => {
      previousDuesMap[d.student_id] =
        (previousDuesMap[d.student_id] || 0) +
        parseFloat(d.remaining_due || 0);
    });

    const studentsWithoutDues = studentIds.filter((id) => !previousDuesMap[id]);
    let fallbackDuesMap = {};
    if (studentsWithoutDues.length > 0) {
      const { data: bills } = await supabase
        .from("fee_bills")
        .select("id, student_id, total_amount")
        .in("student_id", studentsWithoutDues);

      if (bills && bills.length > 0) {
        const billIds = bills.map((b) => b.id);
        const { data: payments } = await supabase
          .from("fee_payments")
          .select("bill_id, amount_paid")
          .in("bill_id", billIds);

        const paidMap = {};
        (payments || []).forEach((p) => {
          paidMap[p.bill_id] = (paidMap[p.bill_id] || 0) + parseFloat(p.amount_paid || 0);
        });

        bills.forEach((b) => {
          const outstanding = Math.max(
            0,
            parseFloat(b.total_amount || 0) - (paidMap[b.id] || 0)
          );
          fallbackDuesMap[b.student_id] =
            (fallbackDuesMap[b.student_id] || 0) + outstanding;
        });
      }
    }

    const studentsWithDue = (students || []).map((s) => ({
      ...s,
      previous_due: previousDuesMap[s.id] || fallbackDuesMap[s.id] || 0,
    }));

    res.json(studentsWithDue);
  } catch (err) {
    console.error("STUDENTS API ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ===============================
   ADD NEW STUDENT (ADMIN ONLY)
   =============================== */
router.post("/add", adminOnly, async (req, res) => {
  try {
    const {
      name,
      father_name,
      mother_name,
      gender,
      class: clsRaw,
      roll_no: rollNoRaw,
      section: sectionRaw,
      academic_year: academicYearRaw,
      mobile,
      address,
      uses_transport,
      transport_charge,
    } = req.body;

    const cls = sanitizeString(clsRaw);
    const section = sanitizeString(sectionRaw);
    const academicYear =
      normalizeAcademicYear(academicYearRaw) || getDefaultAcademicYear();
    const rollNo = normalizeRollNo(rollNoRaw, { required: true });

    if (!name || !cls || !section) {
      return res.status(400).json({
        message: "name, class, section and roll_no are required",
      });
    }

    const hasConflict = await checkRollConflictForActiveStudent({
      className: cls,
      section,
      academicYear,
      rollNo,
    });
    if (hasConflict) {
      return res.status(409).json({
        message: buildRollConflictMessage(cls, section, academicYear, rollNo),
        code: ROLL_CONFLICT_ERROR_CODE,
      });
    }

    const normalizedUsesTransport = normalizeOptionalTransport(uses_transport);

    const { data, error } = await supabase
      .from("students")
      .insert([
        {
          name: sanitizeString(name),
          father_name: sanitizeString(father_name),
          mother_name: sanitizeString(mother_name),
          gender: sanitizeString(gender),
          class: cls,
          section,
          roll_no: rollNo,
          academic_year: academicYear,
          status: STUDENT_STATUS.ACTIVE,
          left_date: null,
          mobile: sanitizeString(mobile),
          address: sanitizeString(address),
          uses_transport: normalizedUsesTransport ?? false,
          transport_charge:
            normalizedUsesTransport === false ? null : transport_charge ?? null,
        },
      ])
      .select("id, class, section, roll_no, academic_year, status")
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          message: buildRollConflictMessage(cls, section, academicYear, rollNo),
          code: ROLL_CONFLICT_ERROR_CODE,
        });
      }
      return res.status(500).json({ message: error.message });
    }

    res.status(201).json({
      success: true,
      student_id: data.id,
      class: data.class,
      section: data.section,
      roll_no: data.roll_no,
      academic_year: data.academic_year,
      status: data.status,
    });
  } catch (err) {
    if (err.message.includes("roll_no") || err.message.includes("academic_year")) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
});

/* ===============================
   UPDATE STUDENT (ADMIN ONLY)
   Supports leave/rejoin through status + left_date updates
   =============================== */
router.put("/edit/:id", adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidUuid(id)) {
      return res.status(400).json({ message: "Valid student id is required" });
    }

    const {
      name,
      father_name,
      mother_name,
      gender,
      mobile,
      address,
      class: clsRaw,
      roll_no: rollNoRaw,
      section: sectionRaw,
      academic_year: academicYearRaw,
      status: statusRaw,
      left_date: leftDateRaw,
      uses_transport,
      transport_charge,
    } = req.body;

    const { data: existingStudent, error: checkError } = await supabase
      .from("students")
      .select(
        "id, class, section, roll_no, academic_year, status, left_date, uses_transport"
      )
      .eq("id", id)
      .single();

    if (checkError || !existingStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    const nextClass =
      clsRaw !== undefined ? sanitizeString(clsRaw) : existingStudent.class;
    const nextSection =
      sectionRaw !== undefined ? sanitizeString(sectionRaw) : existingStudent.section;
    const nextAcademicYear =
      academicYearRaw !== undefined
        ? normalizeAcademicYear(academicYearRaw, { required: true })
        : existingStudent.academic_year;
    const nextRollNo =
      rollNoRaw !== undefined
        ? normalizeRollNo(rollNoRaw, { required: true })
        : existingStudent.roll_no;
    const requestedStatus = normalizeStatus(statusRaw);
    const nextStatus = requestedStatus || existingStudent.status || STUDENT_STATUS.ACTIVE;

    if (!nextClass || !nextSection || !nextAcademicYear || !nextRollNo) {
      return res.status(400).json({
        message:
          "class, section, academic_year and roll_no are required for student update",
      });
    }

    let nextLeftDate = existingStudent.left_date;
    const providedLeftDate = normalizeDateOnly(leftDateRaw, {
      field: "left_date",
    });

    if (nextStatus === STUDENT_STATUS.INACTIVE) {
      nextLeftDate = providedLeftDate || existingStudent.left_date || new Date().toISOString().split("T")[0];
    } else {
      nextLeftDate = null;
      if (providedLeftDate) {
        return res.status(400).json({
          message: "left_date must be empty when status is active",
        });
      }
    }

    const rollTupleChanged =
      nextClass !== existingStudent.class ||
      nextSection !== existingStudent.section ||
      nextAcademicYear !== existingStudent.academic_year ||
      String(nextRollNo) !== String(existingStudent.roll_no);

    if (nextStatus === STUDENT_STATUS.ACTIVE && (rollTupleChanged || existingStudent.status !== STUDENT_STATUS.ACTIVE)) {
      const hasConflict = await checkRollConflictForActiveStudent({
        className: nextClass,
        section: nextSection,
        academicYear: nextAcademicYear,
        rollNo: nextRollNo,
        excludeStudentId: id,
      });
      if (hasConflict) {
        return res.status(409).json({
          message: buildRollConflictMessage(
            nextClass,
            nextSection,
            nextAcademicYear,
            nextRollNo
          ),
          code: ROLL_CONFLICT_ERROR_CODE,
        });
      }
    }

    const updateData = {
      class: nextClass,
      section: nextSection,
      academic_year: nextAcademicYear,
      roll_no: nextRollNo,
      status: nextStatus,
      left_date: nextLeftDate,
    };

    if (name !== undefined) updateData.name = sanitizeString(name);
    if (father_name !== undefined) updateData.father_name = sanitizeString(father_name);
    if (mother_name !== undefined) updateData.mother_name = sanitizeString(mother_name);
    if (gender !== undefined) updateData.gender = sanitizeString(gender);
    if (mobile !== undefined) updateData.mobile = sanitizeString(mobile);
    if (address !== undefined) updateData.address = sanitizeString(address);

    const normalizedUsesTransport = normalizeOptionalTransport(uses_transport);
    if (typeof normalizedUsesTransport !== "undefined") {
      updateData.uses_transport = normalizedUsesTransport;
      if (!normalizedUsesTransport) {
        updateData.transport_charge = null;
      } else if (transport_charge !== undefined) {
        updateData.transport_charge = transport_charge;
      }
    } else if (transport_charge !== undefined) {
      updateData.transport_charge = transport_charge;
    }

    const { data: updatedStudent, error } = await supabase
      .from("students")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          message: buildRollConflictMessage(
            nextClass,
            nextSection,
            nextAcademicYear,
            nextRollNo
          ),
          code: ROLL_CONFLICT_ERROR_CODE,
        });
      }
      return res.status(500).json({
        message: "Failed to update student",
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: "Student updated successfully",
      student: updatedStudent,
    });
  } catch (err) {
    console.error("Update student error:", err);
    if (
      err.message.includes("roll_no") ||
      err.message.includes("academic_year") ||
      err.message.includes("status") ||
      err.message.includes("left_date")
    ) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
});

/* ===============================
   LEAVE STUDENT (ADMIN ONLY)
   PATCH /api/students/:id/leave
   =============================== */
router.patch("/:id/leave", adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ message: "Valid student id is required" });
    }

    const leftDate = normalizeDateOnly(req.body?.left_date, {
      field: "left_date",
    }) || new Date().toISOString().split("T")[0];

    const { data: existingStudent, error: fetchError } = await supabase
      .from("students")
      .select("id, name, status, left_date")
      .eq("id", id)
      .single();

    if (fetchError || !existingStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (existingStudent.status === STUDENT_STATUS.INACTIVE) {
      return res.status(409).json({
        message: "Student is already inactive",
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from("students")
      .update({
        status: STUDENT_STATUS.INACTIVE,
        left_date: leftDate,
      })
      .eq("id", id)
      .select("id, name, class, section, roll_no, academic_year, status, left_date")
      .single();

    if (updateError) {
      return res.status(500).json({
        message: "Failed to mark student as inactive",
        error: updateError.message,
      });
    }

    res.json({
      success: true,
      message: "Student marked as inactive successfully",
      student: updated,
    });
  } catch (err) {
    console.error("Leave student error:", err);
    if (err.message.includes("left_date")) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
});

/* ===============================
   REJOIN STUDENT (ADMIN ONLY)
   PATCH /api/students/:id/rejoin
   =============================== */
router.patch("/:id/rejoin", adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ message: "Valid student id is required" });
    }

    const {
      class: clsRaw,
      section: sectionRaw,
      roll_no: rollNoRaw,
      academic_year: academicYearRaw,
    } = req.body || {};

    const cls = sanitizeString(clsRaw);
    const section = sanitizeString(sectionRaw);
    const rollNo = normalizeRollNo(rollNoRaw, { required: true });
    const academicYear = normalizeAcademicYear(academicYearRaw, {
      required: true,
    });

    if (!cls || !section) {
      return res.status(400).json({
        message: "class and section are required",
      });
    }

    const { data: existingStudent, error: fetchError } = await supabase
      .from("students")
      .select("id, status")
      .eq("id", id)
      .single();

    if (fetchError || !existingStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    const hasConflict = await checkRollConflictForActiveStudent({
      className: cls,
      section,
      academicYear,
      rollNo,
      excludeStudentId: id,
    });
    if (hasConflict) {
      return res.status(409).json({
        message: buildRollConflictMessage(cls, section, academicYear, rollNo),
        code: ROLL_CONFLICT_ERROR_CODE,
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from("students")
      .update({
        class: cls,
        section,
        roll_no: rollNo,
        academic_year: academicYear,
        status: STUDENT_STATUS.ACTIVE,
        left_date: null,
      })
      .eq("id", id)
      .select("id, name, class, section, roll_no, academic_year, status, left_date")
      .single();

    if (updateError) {
      if (isUniqueViolation(updateError)) {
        return res.status(409).json({
          message: buildRollConflictMessage(cls, section, academicYear, rollNo),
          code: ROLL_CONFLICT_ERROR_CODE,
        });
      }
      return res.status(500).json({
        message: "Failed to rejoin student",
        error: updateError.message,
      });
    }

    res.json({
      success: true,
      message:
        existingStudent.status === STUDENT_STATUS.INACTIVE
          ? "Student rejoined successfully"
          : "Student updated as active successfully",
      student: updated,
    });
  } catch (err) {
    console.error("Rejoin student error:", err);
    if (err.message.includes("roll_no") || err.message.includes("academic_year")) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
});

/* ===============================
   HARD DELETE DISABLED (ADMIN ONLY)
   Students are permanent records.
   =============================== */
router.delete("/:id", adminOnly, async (req, res) => {
  return res.status(405).json({
    message: "Student deletion is disabled. Use PATCH /api/students/:id/leave instead.",
  });
});

export default router;
