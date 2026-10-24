import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { supabase } from "../services/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");
const FALLBACK_FILE = path.join(DATA_DIR, "examinations_data.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error("Could not create data dir:", err);
  }
}

// Seed initial fallback data
const getInitialFallbackData = () => ({
  examinations: [
    {
      id: "exam-2026-hy-01",
      name: "Half-Yearly Examination 2026-27",
      academic_session: "2026-27",
      exam_type: "Half-Yearly Examination",
      start_date: "2026-10-15",
      end_date: "2026-10-25",
      applicable_classes: ["Nursery", "LKG", "UKG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5"],
      description: "Mid-term comprehensive evaluation covering Term 1 syllabus across all subjects.",
      status: "ongoing",
      result_published: false,
      result_published_at: null,
      created_by: "Administrator",
      created_at: new Date("2026-09-20").toISOString(),
      updated_at: new Date("2026-10-10").toISOString(),
    },
    {
      id: "exam-2026-ut1-01",
      name: "Unit Test 1 (2026-27)",
      academic_session: "2026-27",
      exam_type: "Unit Test",
      start_date: "2026-07-10",
      end_date: "2026-07-16",
      applicable_classes: ["Class 1", "Class 2", "Class 3", "Class 4", "Class 5"],
      description: "First unit assessment for foundational literacy and numeracy.",
      status: "completed",
      result_published: true,
      result_published_at: new Date("2026-07-25").toISOString(),
      created_by: "Administrator",
      created_at: new Date("2026-06-25").toISOString(),
      updated_at: new Date("2026-07-25").toISOString(),
    },
    {
      id: "exam-2026-annual-01",
      name: "Annual Examination 2026-27",
      academic_session: "2026-27",
      exam_type: "Annual Examination",
      start_date: "2027-02-20",
      end_date: "2027-03-05",
      applicable_classes: ["Nursery", "LKG", "UKG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5"],
      description: "Final academic session culmination and grade promotion examination.",
      status: "scheduled",
      result_published: false,
      result_published_at: null,
      created_by: "Administrator",
      created_at: new Date("2026-10-01").toISOString(),
      updated_at: new Date("2026-10-01").toISOString(),
    }
  ],
  examination_subjects: [],
  examination_timetables: [
    {
      id: "tt-hy-c1-01",
      examination_id: "exam-2026-hy-01",
      class_name: "Class 1",
      section: "All",
      subject_name: "English",
      exam_date: "2026-10-15",
      start_time: "09:00 AM",
      end_time: "11:30 AM",
      max_marks: 50,
      pass_marks: 17,
      room_no: "Room 101",
      instructions: "Bring HB pencils and coloring set for section B.",
      status: "published",
      created_at: new Date("2026-10-01").toISOString(),
      updated_at: new Date("2026-10-01").toISOString(),
    },
    {
      id: "tt-hy-c1-02",
      examination_id: "exam-2026-hy-01",
      class_name: "Class 1",
      section: "All",
      subject_name: "Mathematics",
      exam_date: "2026-10-17",
      start_time: "09:00 AM",
      end_time: "11:30 AM",
      max_marks: 50,
      pass_marks: 17,
      room_no: "Room 101",
      instructions: "Rulers and geometric tools permitted.",
      status: "published",
      created_at: new Date("2026-10-01").toISOString(),
      updated_at: new Date("2026-10-01").toISOString(),
    },
    {
      id: "tt-hy-c1-03",
      examination_id: "exam-2026-hy-01",
      class_name: "Class 1",
      section: "All",
      subject_name: "Hindi",
      exam_date: "2026-10-19",
      start_time: "09:00 AM",
      end_time: "11:30 AM",
      max_marks: 50,
      pass_marks: 17,
      room_no: "Room 101",
      instructions: "Oral assessment will be conducted immediately following written paper.",
      status: "published",
      created_at: new Date("2026-10-01").toISOString(),
      updated_at: new Date("2026-10-01").toISOString(),
    },
    {
      id: "tt-hy-c1-04",
      examination_id: "exam-2026-hy-01",
      class_name: "Class 1",
      section: "All",
      subject_name: "EVS",
      exam_date: "2026-10-21",
      start_time: "09:00 AM",
      end_time: "11:30 AM",
      max_marks: 50,
      pass_marks: 17,
      room_no: "Room 101",
      instructions: "Environmental Science comprehensive paper.",
      status: "published",
      created_at: new Date("2026-10-01").toISOString(),
      updated_at: new Date("2026-10-01").toISOString(),
    }
  ],
  examination_marks: [],
  examination_results: [],
  examination_notices: [
    {
      id: "notice-01",
      title: "Half-Yearly Examination 2026-27 Date Sheet Released",
      message: "The comprehensive date sheet for Half-Yearly Examination has been published. Parents and students are requested to review arrival and reporting schedules carefully. Reporting time is 08:30 AM sharp.",
      examination_id: "exam-2026-hy-01",
      target_class: "All",
      target_section: "All",
      notice_type: "timetable",
      status: "published",
      published_at: new Date("2026-10-02").toISOString(),
      created_by: "Principal Office",
      created_at: new Date("2026-10-02").toISOString(),
    },
    {
      id: "notice-02",
      title: "Admit Card & ID Card Mandatory in Examination Hall",
      message: "All students must carry their authentic School ID Card and Examination Admit Card throughout the examination period. No student will be allowed entry without verification.",
      examination_id: "exam-2026-hy-01",
      target_class: "All",
      target_section: "All",
      notice_type: "instructions",
      status: "published",
      published_at: new Date("2026-10-05").toISOString(),
      created_by: "Examination Controller",
      created_at: new Date("2026-10-05").toISOString(),
    }
  ],
  examination_audit_logs: []
});

// Load fallback store
function loadLocalStore() {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const raw = fs.readFileSync(FALLBACK_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading examinations fallback file:", err);
  }
  const initial = getInitialFallbackData();
  saveLocalStore(initial);
  return initial;
}

// Save fallback store
function saveLocalStore(data) {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving examinations fallback file:", err);
  }
}

// Shared grading standard function
export function calculateGrade(percentage) {
  const p = Number(percentage) || 0;
  if (p >= 90) return { grade: "A+", points: 10, remarks: "Outstanding" };
  if (p >= 80) return { grade: "A", points: 9, remarks: "Excellent" };
  if (p >= 70) return { grade: "B+", points: 8, remarks: "Very Good" };
  if (p >= 60) return { grade: "B", points: 7, remarks: "Good" };
  if (p >= 50) return { grade: "C+", points: 6, remarks: "Above Average" };
  if (p >= 40) return { grade: "C", points: 5, remarks: "Average" };
  if (p >= 33) return { grade: "D", points: 4, remarks: "Pass" };
  return { grade: "F", points: 0, remarks: "Needs Improvement" };
}

// Check if Supabase table exists or error out
async function querySupabaseOrFallback(tableName, queryFn, fallbackFn) {
  try {
    const result = await queryFn();
    if (result && !result.error) {
      return { data: result.data, fromSupabase: true };
    }
    // If table missing or schema cache error, fall back gracefully
    const errText = String(result?.error?.message || "").toLowerCase();
    if (errText.includes("relation") || errText.includes("does not exist") || result?.error?.code === "42P01") {
      return { data: fallbackFn(), fromSupabase: false };
    }
    // Default fallback
    return { data: fallbackFn(), fromSupabase: false };
  } catch (err) {
    return { data: fallbackFn(), fromSupabase: false };
  }
}

// Fetch real students from database
async function getEnrolledStudents(className, section = "All") {
  try {
    let q = supabase
      .from("students")
      .select("id, name, roll_no, class, section, status, father_name, mobile, photo_url")
      .order("roll_no", { ascending: true });

    if (className && className !== "All") {
      q = q.eq("class", className);
    }
    if (section && section !== "All") {
      q = q.eq("section", section);
    }

    const { data, error } = await q;
    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn("Could not query students from supabase, using synthetic class sample:", err);
  }

  // Graceful fallback students for testing/empty DB
  return [
    { id: "std-001", name: "Aarav Sharma", roll_no: "1", class: className || "Class 1", section: "A", status: "active", father_name: "Rajesh Sharma", mobile: "9876543210" },
    { id: "std-002", name: "Ananya Patel", roll_no: "2", class: className || "Class 1", section: "A", status: "active", father_name: "Vikram Patel", mobile: "9876543211" },
    { id: "std-003", name: "Rohan Verma", roll_no: "3", class: className || "Class 1", section: "A", status: "active", father_name: "Manoj Verma", mobile: "9876543212" },
    { id: "std-004", name: "Priya Gupta", roll_no: "4", class: className || "Class 1", section: "A", status: "active", father_name: "Sanjay Gupta", mobile: "9876543213" },
    { id: "std-005", name: "Kabir Singh", roll_no: "5", class: className || "Class 1", section: "A", status: "active", father_name: "Harpreet Singh", mobile: "9876543214" },
  ];
}

// Fetch master subjects
async function getMasterSubjects(className) {
  try {
    const { data, error } = await supabase.from("subjects").select("id, name, code, max_external_marks, max_internal_marks");
    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch {
    // ignore
  }

  return [
    { id: "sub-1", name: "English", code: "ENG", max_external_marks: 80, max_internal_marks: 20 },
    { id: "sub-2", name: "Hindi", code: "HIN", max_external_marks: 80, max_internal_marks: 20 },
    { id: "sub-3", name: "Mathematics", code: "MATH", max_external_marks: 80, max_internal_marks: 20 },
    { id: "sub-4", name: "Science / EVS", code: "EVS", max_external_marks: 80, max_internal_marks: 20 },
    { id: "sub-5", name: "Social Studies", code: "SST", max_external_marks: 80, max_internal_marks: 20 },
    { id: "sub-6", name: "Computer Science", code: "COMP", max_external_marks: 50, max_internal_marks: 50 },
    { id: "sub-7", name: "General Knowledge", code: "GK", max_external_marks: 50, max_internal_marks: 0 },
    { id: "sub-8", name: "Art & Craft", code: "ART", max_external_marks: 50, max_internal_marks: 0 },
  ];
}

/* ============================================================================
   1. OVERVIEW & METRICS
   ============================================================================ */
export const getExaminationOverview = async (req, res) => {
  try {
    const session = req.query.session || "2026-27";
    const store = loadLocalStore();

    let exams = store.examinations.filter(
      (e) => !session || e.academic_session === session
    );

    const totalExams = exams.length;
    const upcomingExams = exams.filter((e) => e.status === "scheduled").length;
    const ongoingExams = exams.filter((e) => e.status === "ongoing").length;
    const completedExams = exams.filter((e) => e.status === "completed").length;

    // Pending marks entries count
    const marksRecords = store.examination_marks || [];
    const pendingMarksCount = marksRecords.filter((m) => m.status === "draft" || m.status === "submitted").length;

    // Results awaiting approval / publication
    const resultsRecords = store.examination_results || [];
    const awaitingApprovalCount = resultsRecords.filter((r) => r.status === "under_review" || r.status === "draft").length;

    // Class wise completion stats
    const standardClasses = ["Nursery", "LKG", "UKG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5"];
    const classProgress = standardClasses.map((cls) => {
      const classMarks = marksRecords.filter((m) => m.class_name === cls);
      const totalMarks = classMarks.length;
      const approvedMarks = classMarks.filter((m) => m.status === "approved" || m.status === "published").length;
      const pct = totalMarks > 0 ? Math.round((approvedMarks / totalMarks) * 100) : 0;
      return {
        className: cls,
        totalEntries: totalMarks,
        approvedEntries: approvedMarks,
        percentage: pct,
        status: pct === 100 ? "Completed" : pct > 0 ? "In Progress" : "Pending",
      };
    });

    res.json({
      success: true,
      data: {
        summary: {
          totalExams,
          upcomingExams,
          ongoingExams,
          completedExams,
          pendingMarksCount,
          awaitingApprovalCount,
        },
        upcomingList: exams.filter((e) => e.status === "scheduled" || e.status === "ongoing").slice(0, 5),
        completedList: exams.filter((e) => e.status === "completed").slice(0, 5),
        classProgress,
        notices: (store.examination_notices || []).filter((n) => n.status === "published").slice(0, 4),
        recentActivity: (store.examination_audit_logs || []).slice(-5).reverse(),
      },
    });
  } catch (error) {
    console.error("Overview error:", error);
    res.status(500).json({ success: false, message: "Error fetching overview", error: error.message });
  }
};

/* ============================================================================
   2. EXAM SETUP (CRUD)
   ============================================================================ */
export const getExaminations = async (req, res) => {
  try {
    const { session, type, status, search } = req.query;
    const store = loadLocalStore();
    let list = store.examinations || [];

    if (session && session !== "all") {
      list = list.filter((e) => e.academic_session === session);
    }
    if (type && type !== "all") {
      list = list.filter((e) => e.exam_type.toLowerCase() === type.toLowerCase());
    }
    if (status && status !== "all") {
      list = list.filter((e) => e.status.toLowerCase() === status.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q) || (e.description && e.description.toLowerCase().includes(q)));
    }

    // Sort: ongoing first, then scheduled, then completed, then by start_date descending
    const statusWeight = { ongoing: 1, scheduled: 2, draft: 3, completed: 4, archived: 5 };
    list.sort((a, b) => {
      const diff = (statusWeight[a.status] || 99) - (statusWeight[b.status] || 99);
      if (diff !== 0) return diff;
      return new Date(b.start_date) - new Date(a.start_date);
    });

    res.json({ success: true, count: list.length, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createExamination = async (req, res) => {
  try {
    const { name, academic_session, exam_type, start_date, end_date, applicable_classes, description, status } = req.body;

    if (!name || !academic_session || !exam_type || !start_date || !end_date) {
      return res.status(400).json({ success: false, message: "Missing required fields (name, academic_session, exam_type, start_date, end_date)" });
    }

    if (new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ success: false, message: "End date cannot be earlier than start date" });
    }

    const store = loadLocalStore();

    // Check duplicate
    const exists = store.examinations.find(
      (e) => e.name.toLowerCase() === name.trim().toLowerCase() && e.academic_session === academic_session
    );
    if (exists) {
      return res.status(409).json({ success: false, message: "An examination with this name already exists in the selected academic session" });
    }

    const newExam = {
      id: `exam-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      name: name.trim(),
      academic_session: academic_session.trim(),
      exam_type: exam_type.trim(),
      start_date,
      end_date,
      applicable_classes: Array.isArray(applicable_classes) && applicable_classes.length > 0 ? applicable_classes : ["Class 1"],
      description: description || "",
      status: status || "draft",
      result_published: false,
      result_published_at: null,
      created_by: req.user?.email || "Admin",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.examinations.unshift(newExam);
    saveLocalStore(store);

    // Audit log
    store.examination_audit_logs.push({
      id: `log-${Date.now()}`,
      examination_id: newExam.id,
      action: "EXAM_CREATED",
      performed_by: req.user?.email || "Admin",
      details: { name: newExam.name, session: newExam.academic_session },
      created_at: new Date().toISOString(),
    });
    saveLocalStore(store);

    res.status(201).json({ success: true, message: "Examination created successfully", data: newExam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateExamination = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, academic_session, exam_type, start_date, end_date, applicable_classes, description, status } = req.body;

    const store = loadLocalStore();
    const index = store.examinations.findIndex((e) => e.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: "Examination not found" });
    }

    if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
      return res.status(400).json({ success: false, message: "End date cannot be earlier than start date" });
    }

    const current = store.examinations[index];
    const updated = {
      ...current,
      name: name !== undefined ? name.trim() : current.name,
      academic_session: academic_session !== undefined ? academic_session.trim() : current.academic_session,
      exam_type: exam_type !== undefined ? exam_type.trim() : current.exam_type,
      start_date: start_date !== undefined ? start_date : current.start_date,
      end_date: end_date !== undefined ? end_date : current.end_date,
      applicable_classes: Array.isArray(applicable_classes) ? applicable_classes : current.applicable_classes,
      description: description !== undefined ? description : current.description,
      status: status !== undefined ? status : current.status,
      updated_at: new Date().toISOString(),
    };

    store.examinations[index] = updated;
    saveLocalStore(store);

    res.json({ success: true, message: "Examination updated successfully", data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteExamination = async (req, res) => {
  try {
    const { id } = req.params;
    const store = loadLocalStore();

    const exam = store.examinations.find((e) => e.id === id);
    if (!exam) {
      return res.status(404).json({ success: false, message: "Examination not found" });
    }

    // Safety check: prevent deletion if results are published or dependent marks exist
    const hasPublishedResults = exam.result_published;
    const dependentMarks = (store.examination_marks || []).filter((m) => m.examination_id === id);

    if (hasPublishedResults || dependentMarks.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot permanently delete an examination with published results or recorded marks. Please archive it instead to preserve audit records.",
      });
    }

    store.examinations = store.examinations.filter((e) => e.id !== id);
    store.examination_timetables = (store.examination_timetables || []).filter((t) => t.examination_id !== id);
    saveLocalStore(store);

    res.json({ success: true, message: "Examination removed safely" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const archiveExamination = async (req, res) => {
  try {
    const { id } = req.params;
    const store = loadLocalStore();
    const exam = store.examinations.find((e) => e.id === id);
    if (!exam) {
      return res.status(404).json({ success: false, message: "Examination not found" });
    }

    exam.status = "archived";
    exam.updated_at = new Date().toISOString();
    saveLocalStore(store);

    res.json({ success: true, message: "Examination archived successfully", data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
   3. TIMETABLES & EXAM ROUTINE
   ============================================================================ */
export const getTimetables = async (req, res) => {
  try {
    const { examId } = req.params;
    const { className, section, date } = req.query;

    const store = loadLocalStore();
    let list = (store.examination_timetables || []).filter((t) => t.examination_id === examId);

    if (className && className !== "All") {
      list = list.filter((t) => t.class_name.toLowerCase() === className.toLowerCase());
    }
    if (section && section !== "All") {
      list = list.filter((t) => t.section === "All" || t.section === section);
    }
    if (date) {
      list = list.filter((t) => t.exam_date === date);
    }

    // Sort by date, then start_time
    list.sort((a, b) => {
      const d = new Date(a.exam_date) - new Date(b.exam_date);
      if (d !== 0) return d;
      return (a.start_time || "").localeCompare(b.start_time || "");
    });

    // Conflict detection across all entries of this examination
    const conflicts = [];
    const allForExam = (store.examination_timetables || []).filter((t) => t.examination_id === examId);
    
    for (let i = 0; i < allForExam.length; i++) {
      for (let j = i + 1; j < allForExam.length; j++) {
        const t1 = allForExam[i];
        const t2 = allForExam[j];

        // Same class, same date
        if (t1.class_name === t2.class_name && t1.exam_date === t2.exam_date) {
          // Check overlap in time
          if (t1.start_time === t2.start_time && t1.id !== t2.id) {
            conflicts.push({
              message: `Time conflict detected: ${t1.class_name} has multiple exams scheduled at ${t1.start_time} on ${t1.exam_date} (${t1.subject_name} and ${t2.subject_name})`,
              entries: [t1.id, t2.id],
            });
          }
        }
      }
    }

    res.json({ success: true, count: list.length, data: list, conflicts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createTimetableEntry = async (req, res) => {
  try {
    const { examId } = req.params;
    const { class_name, section, subject_name, exam_date, start_time, end_time, max_marks, room_no, instructions, status } = req.body;

    if (!class_name || !subject_name || !exam_date || !start_time || !end_time) {
      return res.status(400).json({ success: false, message: "Missing required timetable fields (class_name, subject_name, exam_date, start_time, end_time)" });
    }

    const store = loadLocalStore();

    // Check duplicate subject on same date for same class
    const duplicate = (store.examination_timetables || []).find(
      (t) =>
        t.examination_id === examId &&
        t.class_name.toLowerCase() === class_name.toLowerCase() &&
        t.subject_name.toLowerCase() === subject_name.toLowerCase() &&
        t.exam_date === exam_date
    );
    if (duplicate) {
      return res.status(409).json({ success: false, message: `A routine for subject ${subject_name} is already scheduled on ${exam_date} for ${class_name}` });
    }

    const newEntry = {
      id: `tt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      examination_id: examId,
      class_name,
      section: section || "All",
      subject_name,
      exam_date,
      start_time,
      end_time,
      max_marks: Number(max_marks) || 100,
      room_no: room_no || "Examination Hall",
      instructions: instructions || "",
      status: status || "draft",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (!store.examination_timetables) store.examination_timetables = [];
    store.examination_timetables.push(newEntry);
    saveLocalStore(store);

    res.status(201).json({ success: true, message: "Timetable slot added", data: newEntry });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateTimetableEntry = async (req, res) => {
  try {
    const { timetableId } = req.params;
    const store = loadLocalStore();
    const index = (store.examination_timetables || []).findIndex((t) => t.id === timetableId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: "Timetable entry not found" });
    }

    const current = store.examination_timetables[index];
    const updated = {
      ...current,
      ...req.body,
      updated_at: new Date().toISOString(),
    };

    store.examination_timetables[index] = updated;
    saveLocalStore(store);

    res.json({ success: true, message: "Timetable slot updated", data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteTimetableEntry = async (req, res) => {
  try {
    const { timetableId } = req.params;
    const store = loadLocalStore();
    store.examination_timetables = (store.examination_timetables || []).filter((t) => t.id !== timetableId);
    saveLocalStore(store);

    res.json({ success: true, message: "Timetable entry removed" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const copyTimetable = async (req, res) => {
  try {
    const { examId } = req.params;
    const { fromClass, toClass } = req.body;

    if (!fromClass || !toClass) {
      return res.status(400).json({ success: false, message: "fromClass and toClass are required" });
    }

    const store = loadLocalStore();
    const sourceEntries = (store.examination_timetables || []).filter(
      (t) => t.examination_id === examId && t.class_name.toLowerCase() === fromClass.toLowerCase()
    );

    if (sourceEntries.length === 0) {
      return res.status(404).json({ success: false, message: `No timetable entries found for source class ${fromClass}` });
    }

    // Remove existing entries for toClass if any, or append
    store.examination_timetables = (store.examination_timetables || []).filter(
      (t) => !(t.examination_id === examId && t.class_name.toLowerCase() === toClass.toLowerCase())
    );

    const cloned = sourceEntries.map((item) => ({
      ...item,
      id: `tt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      class_name: toClass,
      status: "draft",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    store.examination_timetables.push(...cloned);
    saveLocalStore(store);

    res.json({ success: true, message: `Successfully cloned ${cloned.length} timetable entries to ${toClass}`, count: cloned.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const togglePublishTimetable = async (req, res) => {
  try {
    const { examId } = req.params;
    const { className, publish } = req.body;

    const store = loadLocalStore();
    let count = 0;
    (store.examination_timetables || []).forEach((t) => {
      if (t.examination_id === examId && (!className || className === "All" || t.class_name === className)) {
        t.status = publish ? "published" : "draft";
        t.updated_at = new Date().toISOString();
        count++;
      }
    });

    saveLocalStore(store);

    // Audit log
    store.examination_audit_logs.push({
      id: `log-${Date.now()}`,
      examination_id: examId,
      action: publish ? "TIMETABLE_PUBLISHED" : "TIMETABLE_UNPUBLISHED",
      performed_by: req.user?.email || "Admin",
      details: { className, count },
      created_at: new Date().toISOString(),
    });
    saveLocalStore(store);

    res.json({ success: true, message: `Timetable status updated for ${count} entries`, status: publish ? "published" : "draft" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
   4. SUBJECTS & ASSESSMENT RULES
   ============================================================================ */
export const getExaminationSubjects = async (req, res) => {
  try {
    const { examId } = req.params;
    const { className } = req.query;

    const store = loadLocalStore();
    let subjects = (store.examination_subjects || []).filter((s) => s.examination_id === examId);

    if (className && className !== "All") {
      subjects = subjects.filter((s) => s.class_name.toLowerCase() === className.toLowerCase());
    }

    // If none configured yet for this class, populate from master subjects
    if (subjects.length === 0 && className && className !== "All") {
      const master = await getMasterSubjects(className);
      subjects = master.map((sub) => ({
        id: `esub-${Date.now()}-${sub.id}`,
        examination_id: examId,
        class_name: className,
        subject_name: sub.name,
        subject_code: sub.code || "",
        max_marks: (sub.max_external_marks || 80) + (sub.max_internal_marks || 20),
        pass_marks: Math.round(((sub.max_external_marks || 80) + (sub.max_internal_marks || 20)) * 0.33),
        theory_marks: sub.max_external_marks || 80,
        practical_marks: 0,
        oral_marks: 0,
        internal_marks: sub.max_internal_marks || 20,
        is_optional: false,
        evaluation_type: "marks",
        created_at: new Date().toISOString(),
      }));

      if (!store.examination_subjects) store.examination_subjects = [];
      store.examination_subjects.push(...subjects);
      saveLocalStore(store);
    }

    res.json({ success: true, count: subjects.length, data: subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const saveExaminationSubject = async (req, res) => {
  try {
    const { examId } = req.params;
    const { class_name, subject_name, subject_code, max_marks, pass_marks, theory_marks, practical_marks, oral_marks, internal_marks, is_optional, evaluation_type } = req.body;

    if (!class_name || !subject_name || !max_marks) {
      return res.status(400).json({ success: false, message: "class_name, subject_name and max_marks are required" });
    }

    const max = Number(max_marks);
    const pass = Number(pass_marks) || Math.round(max * 0.33);
    const theory = Number(theory_marks) || 0;
    const practical = Number(practical_marks) || 0;
    const oral = Number(oral_marks) || 0;
    const internal = Number(internal_marks) || 0;

    if (theory + practical + oral + internal > max) {
      return res.status(400).json({ success: false, message: "Sum of assessment components (theory + practical + oral + internal) cannot exceed maximum marks" });
    }

    const store = loadLocalStore();
    if (!store.examination_subjects) store.examination_subjects = [];

    const existingIndex = store.examination_subjects.findIndex(
      (s) => s.examination_id === examId && s.class_name.toLowerCase() === class_name.toLowerCase() && s.subject_name.toLowerCase() === subject_name.toLowerCase()
    );

    const record = {
      id: existingIndex >= 0 ? store.examination_subjects[existingIndex].id : `esub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      examination_id: examId,
      class_name,
      subject_name,
      subject_code: subject_code || "",
      max_marks: max,
      pass_marks: pass,
      theory_marks: theory,
      practical_marks: practical,
      oral_marks: oral,
      internal_marks: internal,
      is_optional: !!is_optional,
      evaluation_type: evaluation_type || "marks",
      updated_at: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      store.examination_subjects[existingIndex] = record;
    } else {
      store.examination_subjects.push(record);
    }

    saveLocalStore(store);
    res.json({ success: true, message: "Subject assessment rules saved", data: record });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
   5. MARKS ENTRY & SUBMISSION WORKFLOW
   ============================================================================ */
export const getMarksSheet = async (req, res) => {
  try {
    const { examId } = req.params;
    const { className, section = "A", subjectName } = req.query;

    if (!className || !subjectName) {
      return res.status(400).json({ success: false, message: "className and subjectName query parameters are required" });
    }

    // 1. Fetch real enrolled students
    const students = await getEnrolledStudents(className, section);

    // 2. Fetch subject config for max marks
    const store = loadLocalStore();
    const subConfig = (store.examination_subjects || []).find(
      (s) => s.examination_id === examId && s.class_name.toLowerCase() === className.toLowerCase() && s.subject_name.toLowerCase() === subjectName.toLowerCase()
    );
    const maxMarks = subConfig ? subConfig.max_marks : 100;
    const passMarks = subConfig ? subConfig.pass_marks : 33;

    // 3. Match with existing marks records
    const existingMarks = (store.examination_marks || []).filter(
      (m) =>
        m.examination_id === examId &&
        m.class_name.toLowerCase() === className.toLowerCase() &&
        m.subject_name.toLowerCase() === subjectName.toLowerCase()
    );

    const studentMarksMap = new Map();
    existingMarks.forEach((m) => {
      studentMarksMap.set(String(m.student_id), m);
    });

    const entries = students.map((std) => {
      const existing = studentMarksMap.get(String(std.id));
      return {
        student_id: std.id,
        roll_no: std.roll_no || "",
        student_name: std.name || "",
        father_name: std.father_name || "",
        class_name: className,
        section: std.section || section,
        marks_obtained: existing?.marks_obtained !== undefined ? existing.marks_obtained : null,
        attendance_status: existing?.attendance_status || "present",
        status: existing?.status || "draft",
        remarks: existing?.remarks || "",
        max_marks: maxMarks,
        pass_marks: passMarks,
      };
    });

    // Check submission status for the whole class-subject batch
    const allSubmitted = entries.length > 0 && entries.every((e) => e.status === "submitted" || e.status === "approved");
    const allApproved = entries.length > 0 && entries.every((e) => e.status === "approved");

    res.json({
      success: true,
      data: {
        className,
        section,
        subjectName,
        maxMarks,
        passMarks,
        status: allApproved ? "approved" : allSubmitted ? "submitted" : "draft",
        totalStudents: entries.length,
        entries,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const batchSaveMarks = async (req, res) => {
  try {
    const { examId } = req.params;
    const { className, section, subjectName, entries, submitForReview } = req.body;

    if (!className || !subjectName || !Array.isArray(entries)) {
      return res.status(400).json({ success: false, message: "Missing required payload (className, subjectName, entries)" });
    }

    const store = loadLocalStore();
    if (!store.examination_marks) store.examination_marks = [];

    // Check subject config
    const subConfig = (store.examination_subjects || []).find(
      (s) => s.examination_id === examId && s.class_name.toLowerCase() === className.toLowerCase() && s.subject_name.toLowerCase() === subjectName.toLowerCase()
    );
    const maxMarks = subConfig ? subConfig.max_marks : 100;

    let savedCount = 0;
    const validationErrors = [];

    entries.forEach((item, idx) => {
      // Validate marks
      if (item.attendance_status === "present" && item.marks_obtained !== null && item.marks_obtained !== undefined && item.marks_obtained !== "") {
        const val = Number(item.marks_obtained);
        if (isNaN(val) || val < 0 || val > maxMarks) {
          validationErrors.push(`Student ${item.student_name || item.student_id} (Roll ${item.roll_no}): Marks (${val}) must be between 0 and ${maxMarks}`);
          return;
        }
      }

      const existingIndex = store.examination_marks.findIndex(
        (m) => m.examination_id === examId && String(m.student_id) === String(item.student_id) && m.subject_name.toLowerCase() === subjectName.toLowerCase()
      );

      const status = submitForReview ? "submitted" : item.status || "draft";

      const markRecord = {
        id: existingIndex >= 0 ? store.examination_marks[existingIndex].id : `mark-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
        examination_id: examId,
        student_id: item.student_id,
        student_name: item.student_name,
        roll_no: item.roll_no,
        class_name: className,
        section: item.section || section || "A",
        subject_name: subjectName,
        marks_obtained: item.attendance_status === "absent" ? null : item.marks_obtained !== null && item.marks_obtained !== "" ? Number(item.marks_obtained) : null,
        max_marks: maxMarks,
        attendance_status: item.attendance_status || "present",
        status: status,
        remarks: item.remarks || "",
        submitted_by: submitForReview ? req.user?.email || "Teacher" : undefined,
        submitted_at: submitForReview ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      };

      if (existingIndex >= 0) {
        store.examination_marks[existingIndex] = markRecord;
      } else {
        store.examination_marks.push(markRecord);
      }
      savedCount++;
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({ success: false, message: "Validation errors encountered in marks entry", errors: validationErrors });
    }

    saveLocalStore(store);

    // Audit log
    store.examination_audit_logs.push({
      id: `log-${Date.now()}`,
      examination_id: examId,
      action: submitForReview ? "MARKS_SUBMITTED_FOR_REVIEW" : "MARKS_SAVED_DRAFT",
      performed_by: req.user?.email || "Teacher",
      details: { className, subjectName, count: savedCount },
      created_at: new Date().toISOString(),
    });
    saveLocalStore(store);

    res.json({
      success: true,
      message: submitForReview ? `Successfully submitted marks for ${savedCount} students for admin approval` : `Successfully saved ${savedCount} student marks`,
      count: savedCount,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const approveMarks = async (req, res) => {
  try {
    const { examId } = req.params;
    const { className, subjectName, approve = true, returnReason } = req.body;

    const store = loadLocalStore();
    let count = 0;
    (store.examination_marks || []).forEach((m) => {
      if (m.examination_id === examId && m.class_name.toLowerCase() === className.toLowerCase() && m.subject_name.toLowerCase() === subjectName.toLowerCase()) {
        m.status = approve ? "approved" : "draft";
        if (approve) {
          m.approved_by = req.user?.email || "Admin";
          m.approved_at = new Date().toISOString();
        } else if (returnReason) {
          m.remarks = `Returned for correction: ${returnReason}`;
        }
        m.updated_at = new Date().toISOString();
        count++;
      }
    });

    saveLocalStore(store);

    // Audit log
    store.examination_audit_logs.push({
      id: `log-${Date.now()}`,
      examination_id: examId,
      action: approve ? "MARKS_APPROVED" : "MARKS_RETURNED_FOR_CORRECTION",
      performed_by: req.user?.email || "Admin",
      details: { className, subjectName, count, returnReason },
      created_at: new Date().toISOString(),
    });
    saveLocalStore(store);

    res.json({
      success: true,
      message: approve ? `Approved marks for ${count} students in ${className} (${subjectName})` : `Returned marks for ${className} (${subjectName}) for corrections`,
      count,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
   6. RESULTS & REPORT CARDS
   ============================================================================ */
export const calculateAndGetResults = async (req, res) => {
  try {
    const { examId } = req.params;
    const { className, section = "A" } = req.query;

    if (!className) {
      return res.status(400).json({ success: false, message: "className query param is required" });
    }

    const store = loadLocalStore();
    const students = await getEnrolledStudents(className, section);

    // Get all subjects configured or scheduled for this class
    const classSubjects = (store.examination_subjects || []).filter(
      (s) => s.examination_id === examId && s.class_name.toLowerCase() === className.toLowerCase()
    );

    const marksRecords = (store.examination_marks || []).filter(
      (m) => m.examination_id === examId && m.class_name.toLowerCase() === className.toLowerCase()
    );

    const resultsList = students.map((std) => {
      const studentMarks = marksRecords.filter((m) => String(m.student_id) === String(std.id));

      let totalObtained = 0;
      let totalMax = 0;
      let hasFailedSubject = false;
      let allAbsent = studentMarks.length > 0 && studentMarks.every((m) => m.attendance_status === "absent");

      const subjectDetails = classSubjects.map((sub) => {
        const markEntry = studentMarks.find((m) => m.subject_name.toLowerCase() === sub.subject_name.toLowerCase());
        const max = sub.max_marks || 100;
        const pass = sub.pass_marks || Math.round(max * 0.33);
        const isAbsent = markEntry?.attendance_status === "absent";
        const isExempted = markEntry?.attendance_status === "exempted";
        const obtained = markEntry?.marks_obtained !== null && markEntry?.marks_obtained !== undefined ? Number(markEntry.marks_obtained) : null;

        if (!isExempted) {
          totalMax += max;
          if (!isAbsent && obtained !== null) {
            totalObtained += obtained;
            if (obtained < pass && !sub.is_optional) {
              hasFailedSubject = true;
            }
          } else if (isAbsent) {
            hasFailedSubject = true;
          }
        }

        const subPercentage = obtained !== null && max > 0 ? (obtained / max) * 100 : 0;
        const subGrade = calculateGrade(subPercentage);

        return {
          subjectName: sub.subject_name,
          subjectCode: sub.subject_code,
          maxMarks: max,
          passMarks: pass,
          marksObtained: obtained,
          attendanceStatus: isAbsent ? "absent" : isExempted ? "exempted" : "present",
          grade: isAbsent ? "AB" : isExempted ? "EX" : subGrade.grade,
          isPassed: !isAbsent && (obtained !== null ? obtained >= pass : false),
        };
      });

      const percentage = totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;
      const gradeInfo = calculateGrade(percentage);
      const isPassed = !hasFailedSubject && percentage >= 33;

      return {
        studentId: std.id,
        rollNo: std.roll_no || "",
        studentName: std.name || "",
        fatherName: std.father_name || "",
        className,
        section: std.section || section,
        totalObtained,
        totalMax,
        percentage,
        grade: allAbsent ? "AB" : gradeInfo.grade,
        resultStatus: allAbsent ? "absent" : isPassed ? "passed" : "failed",
        remarks: gradeInfo.remarks,
        subjectDetails,
      };
    });

    // Assign class ranks for passed students sorted by percentage desc
    const sortedForRank = [...resultsList]
      .filter((r) => r.resultStatus === "passed")
      .sort((a, b) => b.percentage - a.percentage);

    sortedForRank.forEach((r, idx) => {
      r.rank = idx + 1;
    });

    // Save calculated results into store
    resultsList.forEach((resItem) => {
      const existingIdx = (store.examination_results || []).findIndex(
        (r) => r.examination_id === examId && String(r.student_id) === String(resItem.studentId)
      );
      const rec = {
        id: existingIdx >= 0 ? store.examination_results[existingIdx].id : `res-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        examination_id: examId,
        student_id: resItem.studentId,
        student_name: resItem.studentName,
        roll_no: resItem.rollNo,
        class_name: className,
        section: resItem.section,
        total_obtained: resItem.totalObtained,
        total_max: resItem.totalMax,
        percentage: resItem.percentage,
        grade: resItem.grade,
        result_status: resItem.resultStatus,
        subject_details: resItem.subjectDetails,
        remarks: resItem.remarks,
        rank: resItem.rank || null,
        status: existingIdx >= 0 ? store.examination_results[existingIdx].status : "draft",
        calculated_at: new Date().toISOString(),
      };

      if (!store.examination_results) store.examination_results = [];
      if (existingIdx >= 0) {
        store.examination_results[existingIdx] = rec;
      } else {
        store.examination_results.push(rec);
      }
    });

    saveLocalStore(store);

    const exam = store.examinations.find((e) => e.id === examId);

    res.json({
      success: true,
      data: {
        examName: exam?.name || "Examination",
        session: exam?.academic_session || "2026-27",
        isPublished: !!exam?.result_published,
        className,
        section,
        totalStudents: resultsList.length,
        passedCount: resultsList.filter((r) => r.resultStatus === "passed").length,
        failedCount: resultsList.filter((r) => r.resultStatus === "failed").length,
        absentCount: resultsList.filter((r) => r.resultStatus === "absent").length,
        results: resultsList,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const togglePublishResults = async (req, res) => {
  try {
    const { examId } = req.params;
    const { publish = true, reason } = req.body;

    const store = loadLocalStore();
    const exam = store.examinations.find((e) => e.id === examId);
    if (!exam) {
      return res.status(404).json({ success: false, message: "Examination not found" });
    }

    exam.result_published = !!publish;
    exam.result_published_at = publish ? new Date().toISOString() : null;
    exam.updated_at = new Date().toISOString();

    (store.examination_results || []).forEach((r) => {
      if (r.examination_id === examId) {
        r.status = publish ? "published" : "draft";
      }
    });

    saveLocalStore(store);

    // Audit log
    store.examination_audit_logs.push({
      id: `log-${Date.now()}`,
      examination_id: examId,
      action: publish ? "RESULTS_PUBLISHED" : "RESULTS_UNPUBLISHED",
      performed_by: req.user?.email || "Admin",
      details: { reason: reason || (publish ? "Official Publication" : "Administrative Retraction") },
      created_at: new Date().toISOString(),
    });
    saveLocalStore(store);

    res.json({
      success: true,
      message: publish ? "Examination results have been published successfully and are now visible." : "Examination results have been retracted to Draft state.",
      isPublished: exam.result_published,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
   7. NOTICES & CIRCULARS
   ============================================================================ */
export const getNotices = async (req, res) => {
  try {
    const { examId, status } = req.query;
    const store = loadLocalStore();
    let list = store.examination_notices || [];

    if (examId && examId !== "all") {
      list = list.filter((n) => n.examination_id === examId);
    }
    if (status && status !== "all") {
      list = list.filter((n) => n.status === status);
    }

    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json({ success: true, count: list.length, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createNotice = async (req, res) => {
  try {
    const { title, message, examination_id, target_class, target_section, notice_type, status } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, message: "title and message are required" });
    }

    const store = loadLocalStore();
    const newNotice = {
      id: `notice-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim(),
      message: message.trim(),
      examination_id: examination_id || null,
      target_class: target_class || "All",
      target_section: target_section || "All",
      notice_type: notice_type || "announcement",
      status: status || "draft",
      published_at: status === "published" ? new Date().toISOString() : null,
      created_by: req.user?.email || "Admin",
      created_at: new Date().toISOString(),
    };

    if (!store.examination_notices) store.examination_notices = [];
    store.examination_notices.unshift(newNotice);
    saveLocalStore(store);

    res.status(201).json({ success: true, message: "Examination notice created", data: newNotice });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateNotice = async (req, res) => {
  try {
    const { noticeId } = req.params;
    const store = loadLocalStore();
    const index = (store.examination_notices || []).findIndex((n) => n.id === noticeId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: "Notice not found" });
    }

    const updated = {
      ...store.examination_notices[index],
      ...req.body,
      updated_at: new Date().toISOString(),
    };
    if (req.body.status === "published" && !updated.published_at) {
      updated.published_at = new Date().toISOString();
    }

    store.examination_notices[index] = updated;
    saveLocalStore(store);

    res.json({ success: true, message: "Notice updated", data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteNotice = async (req, res) => {
  try {
    const { noticeId } = req.params;
    const store = loadLocalStore();
    store.examination_notices = (store.examination_notices || []).filter((n) => n.id !== noticeId);
    saveLocalStore(store);

    res.json({ success: true, message: "Notice deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ============================================================================
   8. REPORTS & ANALYTICS
   ============================================================================ */
export const getExaminationReports = async (req, res) => {
  try {
    const { examId, reportType = "class_summary", className = "Class 1" } = req.query;
    const store = loadLocalStore();
    const exam = store.examinations.find((e) => e.id === examId);

    if (reportType === "marks_register") {
      const results = (store.examination_results || []).filter(
        (r) => r.examination_id === examId && (!className || className === "All" || r.class_name.toLowerCase() === className.toLowerCase())
      );
      return res.json({ success: true, reportType, exam, data: results });
    }

    if (reportType === "missing_marks") {
      const students = await getEnrolledStudents(className, "All");
      const subjects = (store.examination_subjects || []).filter(
        (s) => s.examination_id === examId && s.class_name.toLowerCase() === className.toLowerCase()
      );
      const marksRecords = (store.examination_marks || []).filter(
        (m) => m.examination_id === examId && m.class_name.toLowerCase() === className.toLowerCase()
      );

      const missing = [];
      students.forEach((std) => {
        subjects.forEach((sub) => {
          const entry = marksRecords.find(
            (m) => String(m.student_id) === String(std.id) && m.subject_name.toLowerCase() === sub.subject_name.toLowerCase()
          );
          if (!entry || (entry.attendance_status === "present" && (entry.marks_obtained === null || entry.marks_obtained === undefined))) {
            missing.push({
              studentId: std.id,
              studentName: std.name,
              rollNo: std.roll_no,
              className,
              subjectName: sub.subject_name,
              status: entry ? "Missing Score" : "No Record",
            });
          }
        });
      });

      return res.json({ success: true, reportType, count: missing.length, data: missing });
    }

    if (reportType === "subject_averages") {
      const subjects = (store.examination_subjects || []).filter(
        (s) => s.examination_id === examId && (!className || className === "All" || s.class_name.toLowerCase() === className.toLowerCase())
      );
      const marksRecords = (store.examination_marks || []).filter(
        (m) => m.examination_id === examId && (!className || className === "All" || m.class_name.toLowerCase() === className.toLowerCase())
      );

      const stats = subjects.map((sub) => {
        const subMarks = marksRecords.filter(
          (m) => m.subject_name.toLowerCase() === sub.subject_name.toLowerCase() && m.marks_obtained !== null && m.attendance_status === "present"
        );
        const scores = subMarks.map((m) => Number(m.marks_obtained));
        const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
        const highest = scores.length > 0 ? Math.max(...scores) : 0;
        const lowest = scores.length > 0 ? Math.min(...scores) : 0;
        const passCount = scores.filter((s) => s >= (sub.pass_marks || 33)).length;
        const passRate = scores.length > 0 ? Math.round((passCount / scores.length) * 100) : 0;

        return {
          subjectName: sub.subject_name,
          className: sub.class_name,
          maxMarks: sub.max_marks,
          passMarks: sub.pass_marks,
          studentCount: scores.length,
          averageScore: Number(avg),
          highestScore: highest,
          lowestScore: lowest,
          passRatePercentage: passRate,
        };
      });

      return res.json({ success: true, reportType, data: stats });
    }

    // Default: class_summary
    const results = (store.examination_results || []).filter((r) => r.examination_id === examId);
    const classes = [...new Set(results.map((r) => r.class_name))];
    const summary = classes.map((cls) => {
      const classRes = results.filter((r) => r.class_name === cls);
      const total = classRes.length;
      const passed = classRes.filter((r) => r.result_status === "passed").length;
      const failed = classRes.filter((r) => r.result_status === "failed").length;
      const absent = classRes.filter((r) => r.result_status === "absent").length;
      const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
      return {
        className: cls,
        totalStudents: total,
        passed,
        failed,
        absent,
        passPercentage: pct,
      };
    });

    res.json({ success: true, reportType: "class_summary", exam, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
