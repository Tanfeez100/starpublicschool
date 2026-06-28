import express from "express";
import { supabase } from "../services/supabase.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = express.Router();

const ATTENDANCE_STATUSES = new Set(["present", "absent", "late"]);
const ACADEMIC_YEAR_REGEX = /^\d{4}-(\d{2}|\d{4})$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const sendError = (res, status, message) =>
  res.status(status).json({ success: false, message });

const toHumanErrorMessage = (errorOrMessage, fallback = "Request failed") => {
  const raw =
    typeof errorOrMessage === "string"
      ? errorOrMessage
      : errorOrMessage?.message || fallback;
  const text = String(raw || "").toLowerCase();

  if (text.includes("row-level security") || text.includes("violates row-level security")) {
    return "Permission issue hai. Database policy is action ko allow nahi kar rahi. Admin ko RLS/service role setup check karna hoga.";
  }

  if (text.includes("schema cache") || text.includes("could not find the table") || text.includes("pgrst205")) {
    return "Database table app ko abhi visible nahi hai. Supabase schema setup/reload required hai.";
  }

  if (text.includes("duplicate key") || text.includes("23505")) {
    return "Ye record pehle se exist karta hai. Duplicate entry save nahi ho sakti.";
  }

  if (text.includes("foreign key") || text.includes("23503")) {
    return "Selected student/teacher/class database me linked nahi mila. Please correct record select karein.";
  }

  if (text.includes("teacher is not assigned")) {
    return "Is teacher account ko abhi koi class/section assign nahi hai. Admin dashboard me isi logged-in teacher ko class assign karein, phir teacher ko dobara login karayein.";
  }

  if (text.includes("invalid input syntax") || text.includes("invalid uuid")) {
    return "Submitted data format valid nahi hai. Please selected value check karein.";
  }

  return raw || fallback;
};

const getHolidayTableErrorMessage = (error) => {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  if (text.includes("holiday_calendar") || text.includes("schema cache") || text.includes("pgrst205")) {
    return "holiday_calendar table is not visible to Supabase API yet. Run HOLIDAY_CALENDAR_SETUP.sql in the same Supabase project, then run notify pgrst, 'reload schema';";
  }
  return toHumanErrorMessage(error, "Holiday calendar database error");
};

const isHolidayCalendarSchemaError = (error) => {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return text.includes("holiday_calendar") || text.includes("schema cache") || text.includes("pgrst205");
};

const sanitizeString = (value) =>
  typeof value === "string" ? value.trim() : value;

const getDefaultAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  return `${currentYear}-${String(currentYear + 1).slice(-2)}`;
};

const normalizeDate = (value, field = "date") => {
  const normalized = sanitizeString(value);
  if (!normalized || !DATE_REGEX.test(normalized)) {
    throw new Error(`${field} must be in YYYY-MM-DD format`);
  }
  return normalized;
};

const isFriday = (date) => {
  if (!DATE_REGEX.test(String(date || ""))) return false;
  return new Date(`${date}T00:00:00.000Z`).getUTCDay() === 5;
};

const normalizeAcademicYear = (value) => {
  const normalized = sanitizeString(value) || getDefaultAcademicYear();
  if (!ACADEMIC_YEAR_REGEX.test(normalized)) {
    throw new Error("academic_year must be in format YYYY-YY or YYYY-YYYY");
  }
  return normalized;
};

const normalizeMonthRange = (month) => {
  if (!month) return null;
  const normalized = sanitizeString(month);
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    throw new Error("month must be in YYYY-MM format");
  }

  const [year, monthIndex] = normalized.split("-").map(Number);
  const start = `${normalized}-01`;
  const end = new Date(Date.UTC(year, monthIndex, 0)).toISOString().split("T")[0];
  return { start, end };
};

const normalizeDateRange = ({ month, from, to } = {}) => {
  if (month) return normalizeMonthRange(month);
  const today = new Date().toISOString().split("T")[0];
  const start = from ? normalizeDate(from, "from") : `${today.slice(0, 7)}-01`;
  const end = to
    ? normalizeDate(to, "to")
    : new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0))
        .toISOString()
        .split("T")[0];
  return { start, end };
};

const getFridaysInRange = (start, end) => {
  const dates = [];
  const current = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);

  while (current <= last) {
    if (current.getUTCDay() === 5) {
      dates.push(current.toISOString().split("T")[0]);
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
};

const getDatesInRange = (start, end) => {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  if (startDate > endDate) {
    const err = new Error("End date start date se pehle nahi ho sakti.");
    err.status = 400;
    throw err;
  }

  const dates = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

const getTeacherAssignments = async (teacherId) => {
  const { data, error } = await supabase
    .from("teacher_assignments")
    .select("teacher_id, class, section, academic_year")
    .eq("teacher_id", teacherId)
    .order("class", { ascending: true })
    .order("section", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

const getTeacherAssignment = async (teacherId) => {
  const assignments = await getTeacherAssignments(teacherId);
  return assignments[0] || null;
};

const createTeacherAssignmentMissingError = (user) => {
  const err = new Error("Teacher is not assigned to any class/section.");
  err.status = 403;
  err.detail = {
    teacherId: user?.id || null,
    teacherEmail: user?.email || null,
  };
  return err;
};

const ensureTeacherAssignment = async (user, className, section, academicYear) => {
  if (user.role !== "teacher") return null;

  const assignments = await getTeacherAssignments(user.id);
  if (!assignments.length) {
    throw createTeacherAssignmentMissingError(user);
  }

  const assignment = assignments.find(
    (item) =>
      item.class === className &&
      item.section === section &&
      item.academic_year === academicYear
  );

  if (!assignment) {
    const err = new Error("Teacher can access only assigned class/section.");
    err.status = 403;
    throw err;
  }

  return assignment;
};

const applyActiveStudentFilter = (query) => query.eq("status", "active");

const fetchActiveStudentsForAttendance = async ({
  className = null,
  section = null,
  academicYear = null,
  studentId = null,
} = {}) => {
  let query = applyActiveStudentFilter(
    supabase
      .from("students")
      .select("id, class, section, academic_year")
  );

  if (studentId) query = query.eq("id", studentId);
  if (className) query = query.eq("class", className);
  if (section) query = query.eq("section", section);
  if (academicYear) query = query.eq("academic_year", academicYear);

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

const deleteAttendanceRowsForScope = async ({
  attendanceDate = null,
  startDate = null,
  endDate = null,
  className = null,
  section = null,
  academicYear = null,
  studentId = null,
} = {}) => {
  let query = supabase.from("attendance_records").delete();

  if (attendanceDate) {
    query = query.eq("attendance_date", attendanceDate);
  } else if (startDate && endDate) {
    query = query.gte("attendance_date", startDate).lte("attendance_date", endDate);
  } else {
    return [];
  }

  if (studentId) query = query.eq("student_id", studentId);
  if (className) query = query.eq("class", className);
  if (section) query = query.eq("section", section);
  if (academicYear) query = query.eq("academic_year", academicYear);

  const { data, error } = await query.select("id");
  if (error) {
    throw new Error(error.message);
  }

  return data || [];
};

const hasAttendanceForScope = async ({ attendanceDate, className, section, academicYear }) => {
  const { data, error } = await supabase
    .from("attendance_records")
    .select("id")
    .eq("attendance_date", attendanceDate)
    .eq("class", className)
    .eq("section", section)
    .eq("academic_year", academicYear)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) && data.length > 0;
};

const isCalendarHoliday = async (attendanceDate) => {
  const { data, error } = await supabase
    .from("holiday_calendar")
    .select("id")
    .lte("start_date", attendanceDate)
    .gte("end_date", attendanceDate)
    .limit(1);

  if (error) {
    if (isHolidayCalendarSchemaError(error)) {
      console.warn("holiday_calendar not visible to Supabase API:", error.message);
      return false;
    }
    throw new Error(getHolidayTableErrorMessage(error));
  }

  return Array.isArray(data) && data.length > 0;
};

const applyRoleRestrictions = async (query, user) => {
  if (user.role === "student") {
    return query.eq("student_id", user.id);
  }

  if (user.role === "teacher") {
    const assignments = await getTeacherAssignments(user.id);
    if (!assignments.length) {
      throw createTeacherAssignmentMissingError(user);
    }

    if (assignments.length === 1) {
      const assignment = assignments[0];
      return query
        .eq("class", assignment.class)
        .eq("section", assignment.section)
        .eq("academic_year", assignment.academic_year);
    }

    const assignmentFilter = assignments
      .map((assignment) =>
        `and(class.eq.${assignment.class},section.eq.${assignment.section},academic_year.eq.${assignment.academic_year})`
      )
      .join(",");
    return query.or(assignmentFilter);
  }

  return query;
};

const toAttendanceMap = (records = []) =>
  records.reduce((map, record) => {
    const date = record.attendance_date;
    if (!map[date]) map[date] = {};
    map[date][record.student_id] = record.status;
    return map;
  }, {});

const getSummary = (records = []) => {
  const summary = records.reduce(
    (acc, record) => {
      if (record.status === "present") acc.present += 1;
      if (record.status === "absent") acc.absent += 1;
      if (record.status === "late") acc.late += 1;
      if (record.status === "holiday") acc.holiday += 1;
      return acc;
    },
    { present: 0, absent: 0, late: 0, holiday: 0 }
  );

  const workingDays = summary.present + summary.absent + summary.late;
  return {
    ...summary,
    workingDays,
    percentage: workingDays > 0 ? Math.round((summary.present / workingDays) * 100) : 0,
  };
};

router.use(authenticate);

router.get("/bootstrap", async (req, res) => {
  try {
    let classes = [];
    let sections = [];
    let assignment = null;
    let assignments = [];
    let message = "";

    if (req.user.role === "teacher") {
      assignments = await getTeacherAssignments(req.user.id);
      assignment = assignments[0] || null;
      if (assignments.length) {
        classes = [...new Set(assignments.map((item) => item.class).filter(Boolean))];
        sections = [...new Set(assignments.map((item) => item.section).filter(Boolean))];
      } else {
        message = "Teacher is not assigned to any class/section.";
      }
    } else if (req.user.role === "student") {
      const { data: student, error } = await supabase
        .from("students")
        .select("id, class, section, roll_no, academic_year, name")
        .eq("id", req.user.id)
        .maybeSingle();

      if (error) return sendError(res, 500, toHumanErrorMessage(error));
      if (student) {
        classes = [student.class].filter(Boolean);
        sections = [student.section].filter(Boolean);
      }
    } else {
      const { data, error } = await applyActiveStudentFilter(
        supabase.from("students").select("class, section")
      );

      if (error) return sendError(res, 500, toHumanErrorMessage(error));
      classes = [...new Set((data || []).map((row) => row.class).filter(Boolean))];
      sections = [...new Set((data || []).map((row) => row.section).filter(Boolean))];
    }

    if (req.user.role === "teacher" && !assignment) {
      return res.json({
        success: true,
        classes,
        sections,
        assignment,
        assignments,
        users: [],
        attendance: {},
        message,
      });
    }

    let recordsQuery = supabase
      .from("attendance_records")
      .select("student_id, attendance_date, status")
      .neq("status", "holiday")
      .eq("academic_year", getDefaultAcademicYear())
      .order("attendance_date", { ascending: false })
      .limit(2500);

    recordsQuery = await applyRoleRestrictions(recordsQuery, req.user);
    const { data: records, error: recordsError } = await recordsQuery;
    if (recordsError) return sendError(res, 500, toHumanErrorMessage(recordsError));

    res.json({
      success: true,
      classes,
      sections,
      assignment,
      assignments,
      users: [],
      attendance: toAttendanceMap(records || []),
      message,
    });
  } catch (err) {
    console.error("Attendance bootstrap error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to load attendance bootstrap"));
  }
});

router.get("/holidays", async (req, res) => {
  try {
    const range = normalizeDateRange(req.query);
    const { data, error } = await supabase
      .from("holiday_calendar")
      .select("id, holiday_date, start_date, end_date, title, description, created_by, created_at, updated_at")
      .lte("start_date", range.end)
      .gte("end_date", range.start)
      .order("start_date", { ascending: true });

    if (error) {
      if (!isHolidayCalendarSchemaError(error)) {
        return sendError(res, 500, getHolidayTableErrorMessage(error));
      }

      console.warn("Holiday calendar falling back to weekly Fridays:", error.message);
      const weeklyOnly = getFridaysInRange(range.start, range.end).map((date) => ({
        id: `friday-${date}`,
        holiday_date: date,
        start_date: date,
        end_date: date,
        title: "Friday Holiday",
        description: "Weekly Friday holiday",
        type: "weekly",
      }));

      return res.json({
        success: true,
        count: weeklyOnly.length,
        range,
        holidays: weeklyOnly,
        warning: getHolidayTableErrorMessage(error),
      });
    }

    const manual = (data || []).map((holiday) => ({
      ...holiday,
      holiday_date: holiday.holiday_date || holiday.start_date,
      type: "manual",
    }));
    const manualDateSet = new Set(
      manual.flatMap((holiday) => getDatesInRange(holiday.start_date, holiday.end_date))
    );
    const weekly = getFridaysInRange(range.start, range.end)
      .filter((date) => !manualDateSet.has(date))
      .map((date) => ({
        id: `friday-${date}`,
        holiday_date: date,
        start_date: date,
        end_date: date,
        title: "Friday Holiday",
        description: "Weekly Friday holiday",
        type: "weekly",
      }));

    const holidays = [...manual, ...weekly].sort((a, b) =>
      String(a.start_date || a.holiday_date).localeCompare(String(b.start_date || b.holiday_date))
    );

    res.json({
      success: true,
      count: holidays.length,
      range,
      holidays,
    });
  } catch (err) {
    console.error("Get holidays error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to fetch holiday calendar"));
  }
});

router.post("/holidays", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return sendError(res, 403, "Only admin can mark calendar holidays.");
    }

    const startDate = normalizeDate(
      req.body?.start_date || req.body?.from || req.body?.date || req.body?.holiday_date,
      "start_date"
    );
    const endDate = normalizeDate(
      req.body?.end_date || req.body?.to || req.body?.date || req.body?.holiday_date || startDate,
      "end_date"
    );
    const holidayDates = getDatesInRange(startDate, endDate);
    const title = sanitizeString(req.body?.title) || "Holiday";
    const description = sanitizeString(req.body?.description) || null;
    const holidayRow = {
      holiday_date: startDate,
      start_date: startDate,
      end_date: endDate,
      title,
      description,
      created_by: req.user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: holidays, error } = await supabase
      .from("holiday_calendar")
      .upsert([holidayRow], { onConflict: "start_date,end_date,title" })
      .select("id, holiday_date, start_date, end_date, title, description, created_by, created_at, updated_at")
      .order("start_date", { ascending: true });

    if (error) return sendError(res, 500, getHolidayTableErrorMessage(error));

    const deletedGroups = await Promise.all(
      holidayDates.map((holidayDate) => deleteAttendanceRowsForScope({ attendanceDate: holidayDate }))
    );
    const deletedAttendance = deletedGroups.flat();

    res.json({
      success: true,
      message:
        holidayDates.length === 1
          ? "Holiday saved successfully."
          : `${holidayDates.length} days holiday saved successfully.`,
      holiday: holidays?.[0] ? { ...holidays[0], type: "manual" } : null,
      holidays: (holidays || []).map((holiday) => ({ ...holiday, type: "manual" })),
      count: holidays?.length || 0,
      deletedAttendance,
      deletedAttendanceCount: deletedAttendance.length,
    });
  } catch (err) {
    console.error("Save holiday error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to save holiday"));
  }
});

const updateHoliday = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return sendError(res, 403, "Only admin can edit calendar holidays.");
    }

    const holidayId = sanitizeString(req.params.id);
    const { data: existingHoliday, error: fetchError } = await supabase
      .from("holiday_calendar")
      .select("id")
      .eq("id", holidayId)
      .maybeSingle();

    if (fetchError) return sendError(res, 500, getHolidayTableErrorMessage(fetchError));
    if (!existingHoliday) return sendError(res, 404, "Holiday not found.");

    const startDate = normalizeDate(
      req.body?.start_date || req.body?.from || req.body?.date || req.body?.holiday_date,
      "start_date"
    );
    const endDate = normalizeDate(
      req.body?.end_date || req.body?.to || req.body?.date || req.body?.holiday_date || startDate,
      "end_date"
    );
    const holidayDates = getDatesInRange(startDate, endDate);
    const title = sanitizeString(req.body?.title) || "Holiday";
    const description = sanitizeString(req.body?.description) || null;

    const { data: holiday, error } = await supabase
      .from("holiday_calendar")
      .update({
        holiday_date: startDate,
        start_date: startDate,
        end_date: endDate,
        title,
        description,
        updated_at: new Date().toISOString(),
      })
      .eq("id", holidayId)
      .select("id, holiday_date, start_date, end_date, title, description, created_by, created_at, updated_at")
      .single();

    if (error) return sendError(res, 500, getHolidayTableErrorMessage(error));

    const deletedGroups = await Promise.all(
      holidayDates.map((holidayDate) => deleteAttendanceRowsForScope({ attendanceDate: holidayDate }))
    );
    const deletedAttendance = deletedGroups.flat();

    res.json({
      success: true,
      message: "Holiday updated successfully.",
      holiday: holiday ? { ...holiday, type: "manual" } : null,
      deletedAttendance,
      deletedAttendanceCount: deletedAttendance.length,
    });
  } catch (err) {
    console.error("Update holiday error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to update holiday"));
  }
};

router.put("/holidays/:id", updateHoliday);
router.patch("/holidays/:id", updateHoliday);

router.delete("/holidays/:id", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return sendError(res, 403, "Only admin can remove calendar holidays.");
    }

    const holidayId = sanitizeString(req.params.id);
    const { data: holiday, error: fetchError } = await supabase
      .from("holiday_calendar")
      .select("id, holiday_date, start_date, end_date")
      .eq("id", holidayId)
      .maybeSingle();

    if (fetchError) return sendError(res, 500, getHolidayTableErrorMessage(fetchError));
    if (!holiday) return sendError(res, 404, "Holiday not found.");

    const { error } = await supabase
      .from("holiday_calendar")
      .delete()
      .eq("id", holidayId);

    if (error) return sendError(res, 500, getHolidayTableErrorMessage(error));

    await supabase
      .from("attendance_records")
      .delete()
      .gte("attendance_date", holiday.start_date || holiday.holiday_date)
      .lte("attendance_date", holiday.end_date || holiday.holiday_date)
      .eq("status", "holiday")
      .eq("marked_by_role", "system");

    res.json({
      success: true,
      message: "Holiday removed successfully.",
    });
  } catch (err) {
    console.error("Remove holiday error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to remove holiday"));
  }
});

router.post("/records", async (req, res) => {
  try {
    if (!["admin", "teacher"].includes(req.user.role)) {
      return sendError(res, 403, "Only admin or teacher can mark attendance.");
    }

    const attendanceDate = normalizeDate(req.body?.date, "date");
    const className = sanitizeString(req.body?.class);
    const section = sanitizeString(req.body?.section);
    const academicYear = normalizeAcademicYear(req.body?.academic_year);
    const statuses = req.body?.statuses || {};

    if (!className || !section) {
      return sendError(res, 400, "class and section are required.");
    }

    await ensureTeacherAssignment(req.user, className, section, academicYear);

    const calendarHoliday = await isCalendarHoliday(attendanceDate);
    if (isFriday(attendanceDate) || calendarHoliday) {
      const deletedAttendance = await deleteAttendanceRowsForScope({
        attendanceDate,
        className,
        section,
        academicYear,
      });

      return res.json({
        success: true,
        message: isFriday(attendanceDate)
          ? "Friday holiday hai. Is date ka attendance record save nahi hoga."
          : "Calendar holiday hai. Is date ka attendance record save nahi hoga.",
        isHoliday: true,
        saved: [],
        deletedAttendance,
        deletedAttendanceCount: deletedAttendance.length,
      });
    }

    const entries = Object.entries(statuses).filter(([, status]) => status);
    if (entries.length === 0) {
      return sendError(res, 400, "At least one student status is required.");
    }

    if (await hasAttendanceForScope({ attendanceDate, className, section, academicYear })) {
      return sendError(
        res,
        409,
        "Is class/section ki attendance is date ke liye already set ho chuki hai. Same day attendance modify nahi ho sakti."
      );
    }

    for (const [studentId, status] of entries) {
      if (!ATTENDANCE_STATUSES.has(status)) {
        return sendError(res, 400, `Invalid attendance status for ${studentId}.`);
      }
    }

    const requestedStudentIds = entries.map(([studentId]) => studentId);
    const { data: students, error: studentError } = await applyActiveStudentFilter(
      supabase
        .from("students")
        .select("id, class, section, academic_year")
        .in("id", requestedStudentIds)
        .eq("class", className)
        .eq("section", section)
        .eq("academic_year", academicYear)
    );

    if (studentError) return sendError(res, 500, toHumanErrorMessage(studentError));
    if ((students || []).length !== requestedStudentIds.length) {
      return sendError(res, 400, "One or more students do not belong to selected class/section/year.");
    }

    const rows = entries.map(([studentId, status]) => ({
      attendance_date: attendanceDate,
      student_id: studentId,
      class: className,
      section,
      academic_year: academicYear,
      status,
      marked_by: req.user.id,
      marked_by_role: req.user.role,
      remarks: null,
    }));

    const { data: saved, error } = await supabase
      .from("attendance_records")
      .insert(rows)
      .select("id, student_id, attendance_date, status");

    if (error) return sendError(res, 500, toHumanErrorMessage(error));

    res.json({
      success: true,
      message: "Attendance saved successfully.",
      saved: saved || [],
    });
  } catch (err) {
    console.error("Save attendance error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to save attendance"));
  }
});

router.get("/records", async (req, res) => {
  try {
    const {
      date,
      student_id: studentId,
      class: classNameRaw,
      section: sectionRaw,
      academic_year: academicYearRaw,
      month,
    } = req.query;

    const monthRange = normalizeMonthRange(month);
    let query = supabase
      .from("attendance_records")
      .select(
        "id, attendance_date, student_id, class, section, academic_year, status, marked_by, marked_by_role, remarks, created_at, updated_at"
      )
      .neq("status", "holiday")
      .order("attendance_date", { ascending: false });

    const attendanceDate = date ? normalizeDate(date, "date") : null;
    const className = classNameRaw ? sanitizeString(classNameRaw) : null;
    const section = sectionRaw ? sanitizeString(sectionRaw) : null;
    const academicYear = normalizeAcademicYear(academicYearRaw);
    const isHolidayDate = attendanceDate
      ? isFriday(attendanceDate) || (await isCalendarHoliday(attendanceDate))
      : false;

    if (isHolidayDate) {
      if (req.user.role === "teacher") {
        const assignments = await getTeacherAssignments(req.user.id);
        const scopedAssignments = className && section && academicYear
          ? assignments.filter(
              (assignment) =>
                assignment.class === className &&
                assignment.section === section &&
                assignment.academic_year === academicYear
            )
          : assignments;

        await Promise.all(
          scopedAssignments.map((assignment) => deleteAttendanceRowsForScope({
            attendanceDate,
            className: assignment.class,
            section: assignment.section,
            academicYear: assignment.academic_year,
          }))
        );
      } else if (req.user.role === "student") {
        await deleteAttendanceRowsForScope({
          attendanceDate,
          studentId: req.user.id,
        });
      } else {
        await deleteAttendanceRowsForScope({
          attendanceDate,
          className,
          section,
          academicYear,
        });
      }
    }

    if (attendanceDate) query = query.eq("attendance_date", attendanceDate);
    if (monthRange) query = query.gte("attendance_date", monthRange.start).lte("attendance_date", monthRange.end);
    if (studentId) query = query.eq("student_id", sanitizeString(studentId));
    if (className) query = query.eq("class", className);
    if (section) query = query.eq("section", section);
    if (academicYear) query = query.eq("academic_year", academicYear);

    query = await applyRoleRestrictions(query, req.user);

    const { data, error } = await query;
    if (error) return sendError(res, 500, toHumanErrorMessage(error));

    res.json({
      success: true,
      count: data?.length || 0,
      records: data || [],
      attendance: toAttendanceMap(data || []),
      isHoliday: isHolidayDate,
    });
  } catch (err) {
    console.error("Get attendance records error:", {
      message: err.message,
      status: err.status,
      detail: err.detail,
      user: { id: req.user?.id, email: req.user?.email, role: req.user?.role },
    });
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to fetch attendance records"));
  }
});

router.get("/students/:studentId", async (req, res) => {
  try {
    const studentId = sanitizeString(req.params.studentId);
    if (req.user.role === "student" && req.user.id !== studentId) {
      return sendError(res, 403, "Student can access only own attendance.");
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .maybeSingle();

    if (studentError) return sendError(res, 500, toHumanErrorMessage(studentError));
    if (!student) return sendError(res, 404, "Student not found.");

    if (req.user.role === "teacher") {
      await ensureTeacherAssignment(req.user, student.class, student.section, student.academic_year);
    }

    let query = supabase
      .from("attendance_records")
      .select(
        "id, attendance_date, student_id, class, section, academic_year, status, marked_by, marked_by_role, remarks, created_at, updated_at"
      )
      .eq("student_id", studentId)
      .neq("status", "holiday")
      .order("attendance_date", { ascending: false });

    query = await applyRoleRestrictions(query, req.user);
    const { data: records, error } = await query;
    if (error) return sendError(res, 500, toHumanErrorMessage(error));

    res.json({
      success: true,
      student,
      records: records || [],
      summary: getSummary(records || []),
    });
  } catch (err) {
    console.error("Get student attendance error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to fetch student attendance"));
  }
});

export default router;
