import express from "express";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { supabase } from "../services/supabase.js";

const router = express.Router();

const MONTH_RANGE_REGEX = /^\d{4}-\d{2}$/;

const normalizeDateOnly = (value) => {
  const input = String(value || "").trim();
  if (!input) return "";

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
};

const normalizeMonthRange = (month) => {
  const input = String(month || "").trim();
  if (!input) return null;
  if (!MONTH_RANGE_REGEX.test(input)) {
    throw new Error("month must be in YYYY-MM format");
  }

  const [year, monthIndex] = input.split("-").map(Number);
  const start = `${input}-01`;
  const end = new Date(Date.UTC(year, monthIndex, 0)).toISOString().slice(0, 10);
  return { start, end };
};

const parseStudentSnapshot = (student) => ({
  id: student.id,
  class: student.class || "",
  section: student.section || "",
  roll_no: student.roll_no || null,
  academic_year: student.academic_year || "",
  status: student.status || "",
});

const fetchStudentSnapshot = async (studentId) => {
  const { data, error } = await supabase
    .from("students")
    .select("id, class, section, roll_no, academic_year, status")
    .eq("id", studentId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? parseStudentSnapshot(data) : null;
};

const enrichLeaveRequests = async (requests = []) => {
  const studentIds = [...new Set((requests || []).map((request) => request.student_id).filter(Boolean))];
  if (!studentIds.length) return requests || [];

  const { data: students, error } = await supabase
    .from("students")
    .select("id, name, class, section, roll_no, academic_year, mobile")
    .in("id", studentIds);

  if (error) {
    throw new Error(error.message);
  }

  const studentMap = new Map((students || []).map((student) => [student.id, student]));

  return (requests || []).map((request) => ({
    ...request,
    student: studentMap.get(request.student_id) || null,
  }));
};

router.post("/", authenticate, authorize("student"), async (req, res) => {
  try {
    const leaveType = String(req.body?.leave_type || "").trim();
    const reason = String(req.body?.reason || "").trim();
    const fromDate = normalizeDateOnly(req.body?.from_date || req.body?.fromDate);
    const toDate = normalizeDateOnly(req.body?.to_date || req.body?.toDate);

    if (!leaveType) {
      return res.status(400).json({ success: false, message: "leave_type is required." });
    }

    if (!fromDate || !toDate) {
      return res.status(400).json({ success: false, message: "from_date and to_date are required." });
    }

    if (new Date(toDate).getTime() < new Date(fromDate).getTime()) {
      return res.status(400).json({ success: false, message: "to_date must be on or after from_date." });
    }

    if (!reason) {
      return res.status(400).json({ success: false, message: "reason is required." });
    }

    const student = await fetchStudentSnapshot(req.user.id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    if (String(student.status || "").toLowerCase() !== "active") {
      return res.status(403).json({
        success: false,
        message: "Inactive student leave request submit nahi kar sakta.",
      });
    }

    const payload = {
      student_id: student.id,
      class: student.class || req.user.class || "",
      section: student.section || req.user.section || "",
      roll_no: Number(student.roll_no || req.user.rollNo || 0),
      academic_year: student.academic_year || req.user.academicYear || "",
      leave_type: leaveType,
      from_date: fromDate,
      to_date: toDate,
      reason,
      status: "pending",
    };

    if (!payload.class || !payload.section || !payload.academic_year || !payload.roll_no) {
      return res.status(400).json({
        success: false,
        message: "Student profile is missing class, section, roll number, or academic year.",
      });
    }

    const { data, error } = await supabase
      .from("student_leave_requests")
      .insert([payload])
      .select("id, student_id, class, section, roll_no, academic_year, leave_type, from_date, to_date, reason, status, admin_remarks, decided_by, decided_at, created_at, updated_at")
      .single();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.status(201).json({
      success: true,
      message: "Leave request submitted.",
      request: data,
    });
  } catch (error) {
    console.error("Student leave submit error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

router.get("/me", authenticate, authorize("student"), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("student_leave_requests")
      .select("id, student_id, class, section, roll_no, academic_year, leave_type, from_date, to_date, reason, status, admin_remarks, decided_by, decided_at, created_at, updated_at")
      .eq("student_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    return res.json({
      success: true,
      count: data?.length || 0,
      requests: data || [],
    });
  } catch (error) {
    console.error("Student leave list error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

router.get("/admin", authenticate, authorize("teacher", "admin"), async (req, res) => {
  try {
    let query = supabase
      .from("student_leave_requests")
      .select("id, student_id, class, section, roll_no, academic_year, leave_type, from_date, to_date, reason, status, admin_remarks, decided_by, decided_at, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (req.query.status) {
      query = query.eq("status", String(req.query.status).trim());
    }

    if (req.query.month) {
      const range = normalizeMonthRange(req.query.month);
      query = query.gte("from_date", range.start).lte("from_date", range.end);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    const requests = await enrichLeaveRequests(data || []);

    return res.json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("Admin student leave list error:", error);
    return res.status(500).json({ success: false, message: error.message || "Something went wrong. Please try again." });
  }
});

router.patch("/admin/:id", authenticate, authorize("teacher", "admin"), async (req, res) => {
  try {
    const status = String(req.body?.status || "").trim().toLowerCase();
    const adminRemarks = String(req.body?.admin_remarks || req.body?.adminRemarks || "").trim();

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status approved ya rejected hona chahiye.",
      });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("student_leave_requests")
      .select("id, student_id, class, section, roll_no, academic_year, leave_type, from_date, to_date, reason, status, admin_remarks, decided_by, decided_at, created_at, updated_at")
      .eq("id", req.params.id)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({ success: false, message: fetchError.message });
    }

    if (!existing) {
      return res.status(404).json({ success: false, message: "Leave request not found." });
    }

    const { data, error } = await supabase
      .from("student_leave_requests")
      .update({
        status,
        admin_remarks: adminRemarks || null,
        decided_by: req.user.id,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id, student_id, class, section, roll_no, academic_year, leave_type, from_date, to_date, reason, status, admin_remarks, decided_by, decided_at, created_at, updated_at")
      .single();

    if (error) {
      return res.status(500).json({ success: false, message: error.message });
    }

    const enriched = await enrichLeaveRequests([data]);

    return res.json({
      success: true,
      message: "Leave request updated.",
      request: enriched[0] || data,
    });
  } catch (error) {
    console.error("Admin student leave update error:", error);
    return res.status(500).json({ success: false, message: error.message || "Something went wrong. Please try again." });
  }
});

export default router;
