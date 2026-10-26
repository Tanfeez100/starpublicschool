import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { supabase } from "../services/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");
const FALLBACK_FILE = path.join(DATA_DIR, "timetable_data.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error("Could not create data dir for timetable:", err);
  }
}

// Default initial settings and periods
const getInitialTimetableData = () => {
  const settingsId = "setting-sps-2026-default";
  const defaultPeriods = [
    {
      id: "p-0",
      settings_id: settingsId,
      weekday: "ALL",
      period_number: 0,
      name: "Morning Assembly",
      type: "assembly",
      start_time: "08:00",
      end_time: "08:30",
      is_break: true,
      is_active: true,
      sort_order: 0,
    },
    {
      id: "p-1",
      settings_id: settingsId,
      weekday: "ALL",
      period_number: 1,
      name: "Period 1",
      type: "regular",
      start_time: "08:30",
      end_time: "09:15",
      is_break: false,
      is_active: true,
      sort_order: 1,
    },
    {
      id: "p-2",
      settings_id: settingsId,
      weekday: "ALL",
      period_number: 2,
      name: "Period 2",
      type: "regular",
      start_time: "09:15",
      end_time: "10:00",
      is_break: false,
      is_active: true,
      sort_order: 2,
    },
    {
      id: "p-3",
      settings_id: settingsId,
      weekday: "ALL",
      period_number: 3,
      name: "Period 3",
      type: "regular",
      start_time: "10:00",
      end_time: "10:45",
      is_break: false,
      is_active: true,
      sort_order: 3,
    },
    {
      id: "p-break",
      settings_id: settingsId,
      weekday: "ALL",
      period_number: 4,
      name: "Recess / Lunch Break",
      type: "lunch",
      start_time: "10:45",
      end_time: "11:20",
      is_break: true,
      is_active: true,
      sort_order: 4,
    },
    {
      id: "p-5",
      settings_id: settingsId,
      weekday: "ALL",
      period_number: 5,
      name: "Period 4",
      type: "regular",
      start_time: "11:20",
      end_time: "12:05",
      is_break: false,
      is_active: true,
      sort_order: 5,
    },
    {
      id: "p-6",
      settings_id: settingsId,
      weekday: "ALL",
      period_number: 6,
      name: "Period 5",
      type: "regular",
      start_time: "12:05",
      end_time: "12:50",
      is_break: false,
      is_active: true,
      sort_order: 6,
    },
    {
      id: "p-7",
      settings_id: settingsId,
      weekday: "ALL",
      period_number: 7,
      name: "Period 6",
      type: "regular",
      start_time: "12:50",
      end_time: "13:35",
      is_break: false,
      is_active: true,
      sort_order: 7,
    },
    {
      id: "p-8",
      settings_id: settingsId,
      weekday: "ALL",
      period_number: 8,
      name: "Period 7",
      type: "regular",
      start_time: "13:35",
      end_time: "14:20",
      is_break: false,
      is_active: true,
      sort_order: 8,
    },
  ];

  return {
    settings: {
      id: settingsId,
      academic_session: "2026-27",
      effective_date: "2026-04-01",
      school_start_time: "08:00",
      school_end_time: "14:20",
      working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      periods_per_day: 8,
      description: "Star Public School Standard Academic Timetable Schedule",
      status: "active",
      created_by: "Administrator",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    periods: defaultPeriods,
    entries: [
      // Class 1 - Section A Monday Schedule Seed
      {
        id: "tt-slot-c1a-mon-1",
        academic_session: "2026-27",
        weekday: "Monday",
        period_id: "p-1",
        period_number: 1,
        start_time: "08:30",
        end_time: "09:15",
        class_name: "1",
        section: "A",
        subject_name: "English",
        teacher_id: "d8ee2bf4-2f96-4997-8c52-d2ed2d30a2f0",
        teacher_name: "TANZEEM AHMAD",
        room_no: "Room 101",
        status: "published",
        effective_date: "2026-04-01",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "tt-slot-c1a-mon-2",
        academic_session: "2026-27",
        weekday: "Monday",
        period_id: "p-2",
        period_number: 2,
        start_time: "09:15",
        end_time: "10:00",
        class_name: "1",
        section: "A",
        subject_name: "Mathematics",
        teacher_id: "6c7b0957-4e8c-4a4d-949a-edd34b97bd49",
        teacher_name: "AJAY KUMAR GIRI",
        room_no: "Room 101",
        status: "published",
        effective_date: "2026-04-01",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "tt-slot-c1a-mon-3",
        academic_session: "2026-27",
        weekday: "Monday",
        period_id: "p-3",
        period_number: 3,
        start_time: "10:00",
        end_time: "10:45",
        class_name: "1",
        section: "A",
        subject_name: "Hindi",
        teacher_id: "d8ee2bf4-2f96-4997-8c52-d2ed2d30a2f0",
        teacher_name: "TANZEEM AHMAD",
        room_no: "Room 101",
        status: "published",
        effective_date: "2026-04-01",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "tt-slot-c1a-mon-5",
        academic_session: "2026-27",
        weekday: "Monday",
        period_id: "p-5",
        period_number: 5,
        start_time: "11:20",
        end_time: "12:05",
        class_name: "1",
        section: "A",
        subject_name: "EVS",
        teacher_id: "6c7b0957-4e8c-4a4d-949a-edd34b97bd49",
        teacher_name: "AJAY KUMAR GIRI",
        room_no: "Room 101",
        status: "published",
        effective_date: "2026-04-01",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    substitutions: [],
    audit_logs: [],
  };
};

function readLocalStore() {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const raw = fs.readFileSync(FALLBACK_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.substitutions)) parsed.substitutions = [];
      if (!Array.isArray(parsed.entries)) parsed.entries = [];
      if (!Array.isArray(parsed.periods)) parsed.periods = [];
      if (!Array.isArray(parsed.audit_logs)) parsed.audit_logs = [];
      return parsed;
    }
  } catch (err) {
    console.error("Error reading timetable fallback file:", err);
  }
  const initial = getInitialTimetableData();
  saveLocalStore(initial);
  return initial;
}

function saveLocalStore(data) {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving timetable fallback file:", err);
  }
}

// Convert "HH:MM" string to minutes from midnight
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return -1;
  const parts = timeStr.trim().split(":");
  if (parts.length < 2) return -1;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return -1;
  return hours * 60 + minutes;
}

// Validate period timings against school bounds and other periods
function validatePeriodsNoOverlap(periods, schoolStartTime, schoolEndTime) {
  const errors = [];
  const schoolStart = timeToMinutes(schoolStartTime);
  const schoolEnd = timeToMinutes(schoolEndTime);

  const activePeriods = periods.filter((p) => p.is_active !== false);

  // 1. Check each period individually
  for (const period of activePeriods) {
    const start = timeToMinutes(period.start_time);
    const end = timeToMinutes(period.end_time);

    if (start === -1 || end === -1) {
      errors.push(`Period "${period.name || period.period_number}" has invalid time format.`);
      continue;
    }
    if (start >= end) {
      errors.push(
        `Period "${period.name || period.period_number}" start time (${period.start_time}) must be earlier than end time (${period.end_time}).`
      );
    }
    if (schoolStart !== -1 && start < schoolStart) {
      errors.push(
        `Period "${period.name}" starts at ${period.start_time}, which is before school opening time (${schoolStartTime}).`
      );
    }
    if (schoolEnd !== -1 && end > schoolEnd) {
      errors.push(
        `Period "${period.name}" ends at ${period.end_time}, which is after school closing time (${schoolEndTime}).`
      );
    }
  }

  // 2. Check overlap between active periods grouped by weekday
  const byWeekday = {};
  for (const p of activePeriods) {
    const day = p.weekday || "ALL";
    if (!byWeekday[day]) byWeekday[day] = [];
    byWeekday[day].push(p);
  }

  for (const day of Object.keys(byWeekday)) {
    const list = byWeekday[day];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p1 = list[i];
        const p2 = list[j];
        const s1 = timeToMinutes(p1.start_time);
        const e1 = timeToMinutes(p1.end_time);
        const s2 = timeToMinutes(p2.start_time);
        const e2 = timeToMinutes(p2.end_time);

        if (s1 < e2 && s2 < e1) {
          errors.push(
            `Timing conflict: "${p1.name}" (${p1.start_time}-${p1.end_time}) overlaps with "${p2.name}" (${p2.start_time}-${p2.end_time}) on schedule ${day}.`
          );
        }
      }
    }
  }

  return errors;
}

// Comprehensive Slot Conflict Detector
export function detectSlotConflicts({
  academic_session,
  weekday,
  period_number,
  class_name,
  section,
  teacher_id,
  teacher_name,
  room_no,
  excludeEntryId = null,
  allEntries = [],
}) {
  const conflicts = [];

  const candidateEntries = allEntries.filter((e) => {
    if (excludeEntryId && e.id === excludeEntryId) return false;
    if (academic_session && e.academic_session !== academic_session) return false;
    if (weekday && e.weekday !== weekday) return false;
    if (Number(e.period_number) !== Number(period_number)) return false;
    return true;
  });

  for (const entry of candidateEntries) {
    // 1. Same Class & Section collision (Class cannot have two subjects in same period)
    if (
      String(entry.class_name).toLowerCase() === String(class_name).toLowerCase() &&
      String(entry.section).toLowerCase() === String(section).toLowerCase()
    ) {
      conflicts.push({
        type: "CLASS_DOUBLE_BOOKING",
        severity: "error",
        message: `Class ${class_name}-${section} already has "${entry.subject_name}" assigned with ${entry.teacher_name || "a teacher"} in Period ${period_number} on ${weekday}.`,
        conflictingEntry: entry,
      });
    }

    // 2. Teacher double booking (Teacher cannot teach two classes simultaneously)
    if (
      teacher_id &&
      entry.teacher_id &&
      String(entry.teacher_id) === String(teacher_id)
    ) {
      conflicts.push({
        type: "TEACHER_DOUBLE_BOOKING",
        severity: "error",
        message: `Teacher ${teacher_name || entry.teacher_name || "selected"} is already assigned to Class ${entry.class_name}-${entry.section} for "${entry.subject_name}" in Period ${period_number} on ${weekday}.`,
        conflictingEntry: entry,
      });
    }

    // 3. Room collision (Room cannot hold two classes in same period)
    if (
      room_no &&
      entry.room_no &&
      String(entry.room_no).trim().toLowerCase() === String(room_no).trim().toLowerCase()
    ) {
      conflicts.push({
        type: "ROOM_COLLISION",
        severity: "error",
        message: `Classroom "${room_no}" is already allocated to Class ${entry.class_name}-${entry.section} in Period ${period_number} on ${weekday}.`,
        conflictingEntry: entry,
      });
    }
  }

  return conflicts;
}

// Log audit action
function logTimetableAudit(action, performedBy, academicSession, details = {}) {
  const store = readLocalStore();
  const logEntry = {
    id: `audit-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    action,
    performed_by: performedBy || "Admin",
    academic_session: academicSession || store.settings?.academic_session || "2026-27",
    details,
    created_at: new Date().toISOString(),
  };
  store.audit_logs = [logEntry, ...(store.audit_logs || [])].slice(0, 500);
  saveLocalStore(store);
}

/* ============================================================================
   1. TIMETABLE SETTINGS & PERIODS CONTROLLERS
   ============================================================================ */

export const getSettings = async (req, res) => {
  try {
    const store = readLocalStore();
    return res.json({
      success: true,
      settings: store.settings,
      periods: store.periods || [],
    });
  } catch (err) {
    console.error("getSettings error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const saveSettings = async (req, res) => {
  try {
    const {
      academic_session,
      effective_date,
      school_start_time,
      school_end_time,
      working_days,
      periods_per_day,
      description,
      periods,
    } = req.body;

    if (!academic_session || !effective_date) {
      return res.status(400).json({
        success: false,
        message: "Academic session and effective date are required.",
      });
    }

    // Validate periods if provided
    if (Array.isArray(periods) && periods.length > 0) {
      const timingErrors = validatePeriodsNoOverlap(
        periods,
        school_start_time || "08:00",
        school_end_time || "14:30"
      );
      if (timingErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Period timing validation failed.",
          errors: timingErrors,
        });
      }
    }

    const store = readLocalStore();
    const updatedSettings = {
      ...store.settings,
      academic_session: academic_session || store.settings.academic_session,
      effective_date: effective_date || store.settings.effective_date,
      school_start_time: school_start_time || store.settings.school_start_time || "08:00",
      school_end_time: school_end_time || store.settings.school_end_time || "14:30",
      working_days: Array.isArray(working_days) ? working_days : store.settings.working_days,
      periods_per_day: Number(periods_per_day) || store.settings.periods_per_day || 8,
      description: description !== undefined ? description : store.settings.description,
      updated_at: new Date().toISOString(),
      updated_by: req.user?.fullName || req.user?.name || "Admin",
    };

    store.settings = updatedSettings;

    if (Array.isArray(periods)) {
      store.periods = periods.map((p, idx) => ({
        ...p,
        id: p.id || `p-${Date.now()}-${idx}`,
        settings_id: updatedSettings.id,
        sort_order: idx,
        updated_at: new Date().toISOString(),
      }));
    }

    saveLocalStore(store);
    logTimetableAudit("UPDATE_SETTINGS", req.user?.fullName || "Admin", academic_session, {
      school_start_time,
      school_end_time,
      periodCount: store.periods.length,
    });

    return res.json({
      success: true,
      message: "School timing and period configuration saved successfully.",
      settings: store.settings,
      periods: store.periods,
    });
  } catch (err) {
    console.error("saveSettings error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getPeriods = async (req, res) => {
  try {
    const store = readLocalStore();
    const { weekday } = req.query;

    let list = store.periods || [];
    if (weekday && weekday !== "ALL") {
      list = list.filter((p) => p.weekday === "ALL" || p.weekday === weekday);
    }

    list.sort((a, b) => (a.sort_order ?? a.period_number) - (b.sort_order ?? b.period_number));

    return res.json({
      success: true,
      count: list.length,
      periods: list,
    });
  } catch (err) {
    console.error("getPeriods error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const savePeriod = async (req, res) => {
  try {
    const { id, period_number, name, type, start_time, end_time, is_break, is_active, weekday } =
      req.body;

    if (!name || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "Period name, start time, and end time are required.",
      });
    }

    const store = readLocalStore();
    const periods = [...(store.periods || [])];
    const targetId = id || req.params.id;

    // Check validity of time
    const startMin = timeToMinutes(start_time);
    const endMin = timeToMinutes(end_time);
    if (startMin >= endMin) {
      return res.status(400).json({
        success: false,
        message: "Start time must be before end time.",
      });
    }

    const updatedPeriod = {
      id: targetId || `p-${Date.now()}`,
      settings_id: store.settings?.id || "default",
      weekday: weekday || "ALL",
      period_number: Number(period_number) || periods.length + 1,
      name: name.trim(),
      type: type || "regular",
      start_time: start_time.trim(),
      end_time: end_time.trim(),
      is_break: Boolean(is_break),
      is_active: is_active !== false,
      updated_at: new Date().toISOString(),
    };

    const existingIndex = periods.findIndex((p) => p.id === targetId);
    if (existingIndex >= 0) {
      periods[existingIndex] = updatedPeriod;
    } else {
      periods.push(updatedPeriod);
    }

    // Run overlap validation
    const errors = validatePeriodsNoOverlap(
      periods,
      store.settings?.school_start_time || "08:00",
      store.settings?.school_end_time || "14:30"
    );
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Period configuration conflicts with existing periods.",
        errors,
      });
    }

    store.periods = periods;
    saveLocalStore(store);

    return res.json({
      success: true,
      message: "Period saved successfully.",
      period: updatedPeriod,
    });
  } catch (err) {
    console.error("savePeriod error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deletePeriod = async (req, res) => {
  try {
    const { id } = req.params;
    const store = readLocalStore();
    store.periods = (store.periods || []).filter((p) => p.id !== id);
    saveLocalStore(store);
    return res.json({
      success: true,
      message: "Period removed successfully.",
    });
  } catch (err) {
    console.error("deletePeriod error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ============================================================================
   2. TIMETABLE ENTRIES CRUD & BATCH SCHEDULING
   ============================================================================ */

export const getTimetableEntries = async (req, res) => {
  try {
    const { academic_session, class_name, section, weekday, teacher_id, status } = req.query;
    const store = readLocalStore();

    let entries = store.entries || [];

    if (academic_session) {
      entries = entries.filter((e) => e.academic_session === academic_session);
    }
    if (class_name && class_name !== "all" && class_name !== "All") {
      entries = entries.filter((e) => String(e.class_name).toLowerCase() === String(class_name).toLowerCase());
    }
    if (section && section !== "all" && section !== "All") {
      entries = entries.filter((e) => String(e.section).toUpperCase() === String(section).toUpperCase());
    }
    if (weekday && weekday !== "all" && weekday !== "All") {
      entries = entries.filter((e) => e.weekday === weekday);
    }
    if (teacher_id) {
      entries = entries.filter((e) => String(e.teacher_id) === String(teacher_id));
    }
    if (status && status !== "all") {
      entries = entries.filter((e) => e.status === status);
    }

    return res.json({
      success: true,
      count: entries.length,
      entries,
    });
  } catch (err) {
    console.error("getTimetableEntries error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const saveTimetableEntry = async (req, res) => {
  try {
    const {
      id,
      academic_session,
      weekday,
      period_id,
      period_number,
      start_time,
      end_time,
      class_name,
      section,
      subject_id,
      subject_name,
      teacher_id,
      teacher_name,
      room_no,
      status,
      effective_date,
    } = req.body;

    if (!academic_session || !weekday || period_number === undefined || !class_name || !subject_name) {
      return res.status(400).json({
        success: false,
        message: "Academic session, weekday, period number, class, and subject are required.",
      });
    }

    const store = readLocalStore();
    const entryId = id || req.params.id || `slot-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

    // Conflict detection
    const conflicts = detectSlotConflicts({
      academic_session,
      weekday,
      period_number: Number(period_number),
      class_name,
      section: section || "A",
      teacher_id,
      teacher_name,
      room_no,
      excludeEntryId: id || req.params.id,
      allEntries: store.entries || [],
    });

    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Scheduling conflict detected. Please resolve before saving.",
        conflicts,
      });
    }

    const newEntry = {
      id: entryId,
      academic_session,
      weekday,
      period_id: period_id || null,
      period_number: Number(period_number),
      start_time: start_time || "",
      end_time: end_time || "",
      class_name: String(class_name),
      section: (section || "A").toUpperCase(),
      subject_id: subject_id || null,
      subject_name: subject_name.trim(),
      teacher_id: teacher_id || null,
      teacher_name: teacher_name ? teacher_name.trim() : null,
      room_no: room_no ? room_no.trim() : null,
      status: status || "draft",
      effective_date: effective_date || store.settings?.effective_date || null,
      updated_by: req.user?.fullName || req.user?.name || "Admin",
      updated_at: new Date().toISOString(),
    };

    const existingIndex = (store.entries || []).findIndex((e) => e.id === entryId);
    if (existingIndex >= 0) {
      newEntry.created_at = store.entries[existingIndex].created_at;
      store.entries[existingIndex] = newEntry;
    } else {
      newEntry.created_at = new Date().toISOString();
      newEntry.created_by = req.user?.fullName || req.user?.name || "Admin";
      store.entries.push(newEntry);
    }

    saveLocalStore(store);
    logTimetableAudit(existingIndex >= 0 ? "UPDATE_SLOT" : "CREATE_SLOT", req.user?.fullName || "Admin", academic_session, {
      class_name,
      section,
      weekday,
      period_number,
      subject_name,
      teacher_name,
    });

    return res.json({
      success: true,
      message: "Timetable slot saved successfully.",
      entry: newEntry,
    });
  } catch (err) {
    console.error("saveTimetableEntry error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteTimetableEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const store = readLocalStore();
    const entry = (store.entries || []).find((e) => e.id === id);

    if (!entry) {
      return res.status(404).json({ success: false, message: "Timetable slot not found." });
    }

    store.entries = store.entries.filter((e) => e.id !== id);
    saveLocalStore(store);

    logTimetableAudit("DELETE_SLOT", req.user?.fullName || "Admin", entry.academic_session, {
      deletedSlot: entry,
    });

    return res.json({
      success: true,
      message: "Timetable slot deleted successfully.",
    });
  } catch (err) {
    console.error("deleteTimetableEntry error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ============================================================================
   3. BATCH ACTIONS: COPY DAY, COPY WEEK, PUBLISH / UNPUBLISH
   ============================================================================ */

export const copyDaySchedule = async (req, res) => {
  try {
    const { academic_session, class_name, section, source_day, target_days, overwrite } = req.body;

    if (!class_name || !source_day || !Array.isArray(target_days) || target_days.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Class name, source day, and target days list are required.",
      });
    }

    const store = readLocalStore();
    const session = academic_session || store.settings?.academic_session || "2026-27";
    const sec = (section || "A").toUpperCase();

    // Source entries
    const sourceEntries = (store.entries || []).filter(
      (e) =>
        e.academic_session === session &&
        String(e.class_name).toLowerCase() === String(class_name).toLowerCase() &&
        String(e.section).toUpperCase() === sec &&
        e.weekday === source_day
    );

    if (sourceEntries.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No timetable slots found for Class ${class_name}-${sec} on ${source_day} to copy.`,
      });
    }

    // Verify conflicts for all target days
    const allConflicts = [];
    const newSlots = [];

    // Working copy of entries to test conflicts sequentially
    let workingEntries = [...store.entries];
    if (overwrite) {
      // Remove existing slots on target days for this class & section
      workingEntries = workingEntries.filter(
        (e) =>
          !(
            e.academic_session === session &&
            String(e.class_name).toLowerCase() === String(class_name).toLowerCase() &&
            String(e.section).toUpperCase() === sec &&
            target_days.includes(e.weekday)
          )
      );
    }

    for (const targetDay of target_days) {
      for (const src of sourceEntries) {
        const slotConflicts = detectSlotConflicts({
          academic_session: session,
          weekday: targetDay,
          period_number: src.period_number,
          class_name,
          section: sec,
          teacher_id: src.teacher_id,
          teacher_name: src.teacher_name,
          room_no: src.room_no,
          allEntries: workingEntries,
        });

        if (slotConflicts.length > 0) {
          allConflicts.push(...slotConflicts);
        } else {
          const clonedSlot = {
            ...src,
            id: `slot-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
            weekday: targetDay,
            status: "draft", // copied slots default to draft until reviewed
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          newSlots.push(clonedSlot);
          workingEntries.push(clonedSlot);
        }
      }
    }

    if (allConflicts.length > 0 && !overwrite) {
      return res.status(409).json({
        success: false,
        message: `Found ${allConflicts.length} conflict(s) when copying to target days.`,
        conflicts: allConflicts,
      });
    }

    store.entries = workingEntries;
    saveLocalStore(store);

    logTimetableAudit("COPY_DAY", req.user?.fullName || "Admin", session, {
      class_name,
      section: sec,
      source_day,
      target_days,
      copiedCount: newSlots.length,
    });

    return res.json({
      success: true,
      message: `Successfully copied ${newSlots.length} slot(s) from ${source_day} to ${target_days.join(", ")}.`,
      copiedSlots: newSlots,
    });
  } catch (err) {
    console.error("copyDaySchedule error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const copyWeekSchedule = async (req, res) => {
  try {
    const { academic_session, source_class, source_section, target_class, target_section, overwrite } =
      req.body;

    if (!source_class || !target_class) {
      return res.status(400).json({
        success: false,
        message: "Source class and target class are required.",
      });
    }

    const store = readLocalStore();
    const session = academic_session || store.settings?.academic_session || "2026-27";
    const srcSec = (source_section || "A").toUpperCase();
    const tgtSec = (target_section || "A").toUpperCase();

    const sourceEntries = (store.entries || []).filter(
      (e) =>
        e.academic_session === session &&
        String(e.class_name).toLowerCase() === String(source_class).toLowerCase() &&
        String(e.section).toUpperCase() === srcSec
    );

    if (sourceEntries.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No weekly schedule found for Class ${source_class}-${srcSec} to copy.`,
      });
    }

    let workingEntries = [...store.entries];
    if (overwrite) {
      workingEntries = workingEntries.filter(
        (e) =>
          !(
            e.academic_session === session &&
            String(e.class_name).toLowerCase() === String(target_class).toLowerCase() &&
            String(e.section).toUpperCase() === tgtSec
          )
      );
    }

    const allConflicts = [];
    const newSlots = [];

    for (const src of sourceEntries) {
      // In week copy, we may want to keep the subject and timings, but alert if the same teacher is booked
      const slotConflicts = detectSlotConflicts({
        academic_session: session,
        weekday: src.weekday,
        period_number: src.period_number,
        class_name: target_class,
        section: tgtSec,
        teacher_id: src.teacher_id,
        teacher_name: src.teacher_name,
        room_no: null, // clear room for different class to avoid false collisions
        allEntries: workingEntries,
      });

      if (slotConflicts.length > 0) {
        allConflicts.push(...slotConflicts);
      } else {
        const cloned = {
          ...src,
          id: `slot-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
          class_name: target_class,
          section: tgtSec,
          room_no: null,
          status: "draft",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        newSlots.push(cloned);
        workingEntries.push(cloned);
      }
    }

    if (allConflicts.length > 0 && !overwrite) {
      return res.status(409).json({
        success: false,
        message: `Cannot copy entire week: detected teacher or class collisions.`,
        conflicts: allConflicts,
      });
    }

    store.entries = workingEntries;
    saveLocalStore(store);

    logTimetableAudit("COPY_WEEK", req.user?.fullName || "Admin", session, {
      source_class,
      source_section: srcSec,
      target_class,
      target_section: tgtSec,
      copiedCount: newSlots.length,
    });

    return res.json({
      success: true,
      message: `Copied ${newSlots.length} weekly slots to Class ${target_class}-${tgtSec}.`,
      copiedSlots: newSlots,
    });
  } catch (err) {
    console.error("copyWeekSchedule error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const togglePublishTimetable = async (req, res) => {
  try {
    const { academic_session, class_name, section, publish = true } = req.body;
    const store = readLocalStore();
    const session = academic_session || store.settings?.academic_session || "2026-27";

    const targetStatus = publish ? "published" : "draft";

    // If publishing, pre-run full conflict check on the slots to be published
    if (publish) {
      const slotsToPublish = (store.entries || []).filter((e) => {
        if (e.academic_session !== session) return false;
        if (class_name && String(e.class_name).toLowerCase() !== String(class_name).toLowerCase()) return false;
        if (section && String(e.section).toUpperCase() !== String(section).toUpperCase()) return false;
        return true;
      });

      const conflicts = [];
      for (const slot of slotsToPublish) {
        const c = detectSlotConflicts({
          academic_session: session,
          weekday: slot.weekday,
          period_number: slot.period_number,
          class_name: slot.class_name,
          section: slot.section,
          teacher_id: slot.teacher_id,
          teacher_name: slot.teacher_name,
          room_no: slot.room_no,
          excludeEntryId: slot.id,
          allEntries: store.entries,
        });
        if (c.length > 0) conflicts.push(...c);
      }

      if (conflicts.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Cannot publish timetable: unresolved conflicts exist.",
          conflicts,
        });
      }
    }

    let updatedCount = 0;
    store.entries = (store.entries || []).map((e) => {
      if (e.academic_session !== session) return e;
      if (class_name && String(e.class_name).toLowerCase() !== String(class_name).toLowerCase()) return e;
      if (section && String(e.section).toUpperCase() !== String(section).toUpperCase()) return e;
      updatedCount++;
      return {
        ...e,
        status: targetStatus,
        effective_date: store.settings?.effective_date || new Date().toISOString().split("T")[0],
        updated_at: new Date().toISOString(),
      };
    });

    saveLocalStore(store);

    logTimetableAudit(publish ? "PUBLISH" : "UNPUBLISH", req.user?.fullName || "Admin", session, {
      class_name: class_name || "ALL",
      section: section || "ALL",
      updatedCount,
    });

    return res.json({
      success: true,
      message: `Timetable successfully ${publish ? "published and made active" : "reverted to draft"}. (${updatedCount} slots)`,
      status: targetStatus,
    });
  } catch (err) {
    console.error("togglePublishTimetable error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ============================================================================
   4. CONFLICT DETECTION & VALIDATION REPORTS
   ============================================================================ */

export const getConflictReport = async (req, res) => {
  try {
    const { academic_session } = req.query;
    const store = readLocalStore();
    const session = academic_session || store.settings?.academic_session || "2026-27";

    const entries = (store.entries || []).filter((e) => e.academic_session === session);
    const conflicts = [];
    const visitedPairs = new Set();

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const e1 = entries[i];
        const e2 = entries[j];

        if (e1.weekday !== e2.weekday || Number(e1.period_number) !== Number(e2.period_number)) {
          continue;
        }

        const pairKey = [e1.id, e2.id].sort().join("-");
        if (visitedPairs.has(pairKey)) continue;

        // 1. Teacher Double-Booking
        if (e1.teacher_id && e2.teacher_id && String(e1.teacher_id) === String(e2.teacher_id)) {
          visitedPairs.add(pairKey);
          conflicts.push({
            id: `c-tch-${pairKey}`,
            category: "Teacher Collision",
            severity: "critical",
            title: `Teacher ${e1.teacher_name || "Assigned"} double-booked on ${e1.weekday} Period ${e1.period_number}`,
            description: `Simultaneously assigned to Class ${e1.class_name}-${e1.section} (${e1.subject_name}) and Class ${e2.class_name}-${e2.section} (${e2.subject_name}).`,
            weekday: e1.weekday,
            period_number: e1.period_number,
            entries: [e1, e2],
          });
        }

        // 2. Class Double-Booking
        if (
          String(e1.class_name).toLowerCase() === String(e2.class_name).toLowerCase() &&
          String(e1.section).toUpperCase() === String(e2.section).toUpperCase()
        ) {
          visitedPairs.add(pairKey);
          conflicts.push({
            id: `c-cls-${pairKey}`,
            category: "Class Collision",
            severity: "critical",
            title: `Class ${e1.class_name}-${e1.section} has multiple subjects in Period ${e1.period_number} on ${e1.weekday}`,
            description: `Assigned both "${e1.subject_name}" (${e1.teacher_name || "No teacher"}) and "${e2.subject_name}" (${e2.teacher_name || "No teacher"}).`,
            weekday: e1.weekday,
            period_number: e1.period_number,
            entries: [e1, e2],
          });
        }

        // 3. Room Collision
        if (
          e1.room_no &&
          e2.room_no &&
          String(e1.room_no).trim().toLowerCase() === String(e2.room_no).trim().toLowerCase()
        ) {
          visitedPairs.add(pairKey);
          conflicts.push({
            id: `c-rm-${pairKey}`,
            category: "Room Collision",
            severity: "warning",
            title: `Room "${e1.room_no}" double-allocated in Period ${e1.period_number} on ${e1.weekday}`,
            description: `Booked for Class ${e1.class_name}-${e1.section} and Class ${e2.class_name}-${e2.section}.`,
            weekday: e1.weekday,
            period_number: e1.period_number,
            entries: [e1, e2],
          });
        }
      }
    }

    return res.json({
      success: true,
      totalConflicts: conflicts.length,
      teacherConflictsCount: conflicts.filter((c) => c.category === "Teacher Collision").length,
      classConflictsCount: conflicts.filter((c) => c.category === "Class Collision").length,
      roomConflictsCount: conflicts.filter((c) => c.category === "Room Collision").length,
      conflicts,
    });
  } catch (err) {
    console.error("getConflictReport error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ============================================================================
   5. TEACHER TIMETABLE & WORKLOAD VIEWS
   ============================================================================ */

export const getTeacherTimetable = async (req, res) => {
  try {
    const requestedTeacherId = req.params.teacherId || req.user?.id;

    // Security scoping: Teachers can only view their own timetable unless admin
    if (req.user?.role === "teacher" && String(req.user?.id) !== String(requestedTeacherId)) {
      return res.status(403).json({
        success: false,
        message: "Access restricted: Teachers can only view their own schedule.",
      });
    }

    const store = readLocalStore();
    const session = req.query.academic_session || store.settings?.academic_session || "2026-27";

    // Teacher's published slots (or draft if admin previewing)
    const teacherEntries = (store.entries || []).filter((e) => {
      if (e.academic_session !== session) return false;
      if (String(e.teacher_id) !== String(requestedTeacherId)) return false;
      if (req.user?.role === "teacher" && e.status !== "published") return false;
      return true;
    });

    // Today's schedule
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const currentDayName = daysOfWeek[new Date().getDay()];

    const todayStr = (req.query.date || new Date().toISOString().split("T")[0]).trim();
    const todaySubstitutions = (store.substitutions || []).filter(
      (s) => s.substitution_date === todayStr && s.status !== "cancelled"
    );

    // 1. Regular slots for today with substitute info if another teacher is covering
    const regularTodaysSlots = teacherEntries
      .filter((e) => e.weekday === currentDayName)
      .map((slot) => {
        const sub = todaySubstitutions.find(
          (s) =>
            Number(s.period_number) === Number(slot.period_number) &&
            String(s.class_name).toLowerCase() === String(slot.class_name).toLowerCase() &&
            String(s.section).toUpperCase() === String(slot.section).toUpperCase()
        );
        if (sub) {
          return {
            ...slot,
            is_substituted_out: true,
            substitute_teacher_id: sub.substitute_teacher_id,
            substitute_teacher_name: sub.substitute_teacher_name,
            substitution_reason: sub.reason,
          };
        }
        return slot;
      });

    // 2. Extra slots where this teacher is covering as a substitute today
    const substituteDutySlots = todaySubstitutions
      .filter((s) => String(s.substitute_teacher_id) === String(requestedTeacherId))
      .map((s) => ({
        id: s.id,
        academic_session: s.academic_session,
        weekday: s.weekday,
        period_number: s.period_number,
        class_name: s.class_name,
        section: s.section,
        subject_name: s.subject_name,
        teacher_id: s.substitute_teacher_id,
        teacher_name: s.substitute_teacher_name,
        is_substitute_duty: true,
        original_teacher_id: s.original_teacher_id,
        original_teacher_name: s.original_teacher_name,
        substitution_reason: s.reason,
      }));

    const combinedTodaysSlots = [...regularTodaysSlots, ...substituteDutySlots].sort(
      (a, b) => Number(a.period_number) - Number(b.period_number)
    );

    // Stats
    const totalWeeklyPeriods = teacherEntries.length;
    const workingDays = store.settings?.working_days || [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const totalPossibleSlots = workingDays.length * (store.settings?.periods_per_day || 8);
    const freePeriods = Math.max(0, totalPossibleSlots - totalWeeklyPeriods);

    const firstPeriod = combinedTodaysSlots[0]?.period_number ?? null;
    const lastPeriod = combinedTodaysSlots[combinedTodaysSlots.length - 1]?.period_number ?? null;

    return res.json({
      success: true,
      teacherId: requestedTeacherId,
      academicSession: session,
      periods: store.periods || [],
      today: {
        weekday: currentDayName,
        date: todayStr,
        slots: combinedTodaysSlots,
        totalPeriodsToday: combinedTodaysSlots.length,
        substituteDutiesCount: substituteDutySlots.length,
        firstPeriod,
        lastPeriod,
      },
      weeklyMatrix: teacherEntries,
      stats: {
        totalWeeklyPeriods,
        freePeriods,
        averagePeriodsPerDay: workingDays.length ? (totalWeeklyPeriods / workingDays.length).toFixed(1) : 0,
        maxWeeklyCapacity: 30, // standard maximum teaching load per week
      },
    });
  } catch (err) {
    console.error("getTeacherTimetable error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getClassTimetable = async (req, res) => {
  try {
    const { className } = req.params;
    const { section = "A", academic_session, date } = req.query;

    const store = readLocalStore();
    const session = academic_session || store.settings?.academic_session || "2026-27";
    const sec = (section || "A").toUpperCase();
    const targetDate = (date || new Date().toISOString().split("T")[0]).trim();

    const substitutions = (store.substitutions || []).filter(
      (s) => s.substitution_date === targetDate && s.status !== "cancelled"
    );

    const rawEntries = (store.entries || []).filter((e) => {
      if (e.academic_session !== session) return false;
      if (String(e.class_name).toLowerCase() !== String(className).toLowerCase()) return false;
      if (String(e.section).toUpperCase() !== sec) return false;
      return true;
    });

    const entries = rawEntries.map((entry) => {
      const sub = substitutions.find(
        (s) =>
          s.weekday === entry.weekday &&
          Number(s.period_number) === Number(entry.period_number) &&
          String(s.class_name).toLowerCase() === String(entry.class_name).toLowerCase() &&
          String(s.section).toUpperCase() === String(entry.section).toUpperCase()
      );
      if (sub) {
        return {
          ...entry,
          substitute_teacher_id: sub.substitute_teacher_id,
          substitute_teacher_name: sub.substitute_teacher_name,
          is_substituted: true,
          original_teacher_name: sub.original_teacher_name || entry.teacher_name,
        };
      }
      return entry;
    });

    return res.json({
      success: true,
      className,
      section: sec,
      academicSession: session,
      date: targetDate,
      settings: store.settings,
      periods: store.periods || [],
      entries,
    });
  } catch (err) {
    console.error("getClassTimetable error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getTeacherWorkloadReport = async (req, res) => {
  try {
    const store = readLocalStore();
    const session = req.query.academic_session || store.settings?.academic_session || "2026-27";

    const entries = (store.entries || []).filter((e) => e.academic_session === session);

    // Group by teacher
    const workloadMap = new Map();
    for (const entry of entries) {
      if (!entry.teacher_id) continue;
      if (!workloadMap.has(entry.teacher_id)) {
        workloadMap.set(entry.teacher_id, {
          teacher_id: entry.teacher_id,
          teacher_name: entry.teacher_name || "Unknown Teacher",
          total_periods: 0,
          by_day: {},
          classes: new Set(),
          subjects: new Set(),
        });
      }
      const data = workloadMap.get(entry.teacher_id);
      data.total_periods++;
      data.by_day[entry.weekday] = (data.by_day[entry.weekday] || 0) + 1;
      data.classes.add(`${entry.class_name}-${entry.section}`);
      data.subjects.add(entry.subject_name);
    }

    const result = Array.from(workloadMap.values()).map((w) => ({
      teacher_id: w.teacher_id,
      teacher_name: w.teacher_name,
      total_periods: w.total_periods,
      by_day: w.by_day,
      classes: Array.from(w.classes),
      subjects: Array.from(w.subjects),
      load_percentage: Math.min(100, Math.round((w.total_periods / 30) * 100)),
      status: w.total_periods > 28 ? "High" : w.total_periods < 15 ? "Low" : "Optimal",
    }));

    result.sort((a, b) => b.total_periods - a.total_periods);

    return res.json({
      success: true,
      count: result.length,
      teachers: result,
    });
  } catch (err) {
    console.error("getTeacherWorkloadReport error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getUnassignedPeriodsReport = async (req, res) => {
  try {
    const store = readLocalStore();
    const session = req.query.academic_session || store.settings?.academic_session || "2026-27";

    const entries = (store.entries || []).filter((e) => e.academic_session === session);
    const unassigned = entries.filter((e) => !e.teacher_id || !e.subject_name);

    return res.json({
      success: true,
      count: unassigned.length,
      unassigned,
    });
  } catch (err) {
    console.error("getUnassignedPeriodsReport error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ============================================================================
   6. DAILY SUBSTITUTION / PROXY MANAGEMENT (When a Teacher is Absent)
   ============================================================================ */

export const getSubstitutions = async (req, res) => {
  try {
    const { date, academic_session, class_name, section, teacher_id } = req.query;
    const store = readLocalStore();
    let list = store.substitutions || [];

    if (date) list = list.filter((s) => s.substitution_date === date);
    if (academic_session) list = list.filter((s) => s.academic_session === academic_session);
    if (class_name && class_name !== "All") {
      list = list.filter((s) => String(s.class_name).toLowerCase() === String(class_name).toLowerCase());
    }
    if (section && section !== "All") {
      list = list.filter((s) => String(s.section).toUpperCase() === String(section).toUpperCase());
    }
    if (teacher_id) {
      list = list.filter(
        (s) => String(s.substitute_teacher_id) === String(teacher_id) || String(s.original_teacher_id) === String(teacher_id)
      );
    }

    return res.json({
      success: true,
      count: list.length,
      substitutions: list,
    });
  } catch (err) {
    console.error("getSubstitutions error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getAvailableSubstitutes = async (req, res) => {
  try {
    const { date, weekday, period_number, academic_session, exclude_teacher_id } = req.query;

    if (!weekday || period_number === undefined) {
      return res.status(400).json({
        success: false,
        message: "Weekday and period number are required to find available substitute teachers.",
      });
    }

    const store = readLocalStore();
    const session = academic_session || store.settings?.academic_session || "2026-27";
    const pNum = Number(period_number);
    const targetDate = (date || new Date().toISOString().split("T")[0]).trim();

    // 1. Find teachers already scheduled in Master Timetable in this period & weekday
    const busyMasterTeacherIds = new Set(
      (store.entries || [])
        .filter(
          (e) =>
            e.academic_session === session &&
            e.weekday === weekday &&
            Number(e.period_number) === pNum &&
            e.teacher_id
        )
        .map((e) => String(e.teacher_id))
    );

    // 2. Find teachers already assigned as substitutes on this date in this period
    const busySubTeacherIds = new Set(
      (store.substitutions || [])
        .filter(
          (s) =>
            s.substitution_date === targetDate &&
            Number(s.period_number) === pNum &&
            s.status !== "cancelled"
        )
        .map((s) => String(s.substitute_teacher_id))
    );

    // 3. Query teacher profiles from DB (fallback to local if DB unavailable)
    let allTeachers = [];
    try {
      const { data: dbTeachers } = await supabase
        .from("teacher_profiles")
        .select("id, full_name, employee_id, designation, department, status")
        .eq("status", "active");

      if (Array.isArray(dbTeachers) && dbTeachers.length > 0) {
        allTeachers = dbTeachers;
      }
    } catch {
      // Fallback
    }

    if (allTeachers.length === 0) {
      // Collect unique teachers from timetable store
      const teacherMap = new Map();
      (store.entries || []).forEach((e) => {
        if (e.teacher_id && !teacherMap.has(e.teacher_id)) {
          teacherMap.set(e.teacher_id, {
            id: e.teacher_id,
            full_name: e.teacher_name || "Faculty",
            designation: "Faculty Member",
          });
        }
      });
      allTeachers = Array.from(teacherMap.values());
    }

    // Filter available teachers
    const available = allTeachers.filter((t) => {
      const tId = String(t.id);
      if (exclude_teacher_id && tId === String(exclude_teacher_id)) return false;
      if (busyMasterTeacherIds.has(tId)) return false;
      if (busySubTeacherIds.has(tId)) return false;
      return true;
    });

    return res.json({
      success: true,
      period_number: pNum,
      weekday,
      date: targetDate,
      count: available.length,
      available_teachers: available.map((t) => ({
        id: t.id,
        fullName: t.full_name || t.fullName || t.name,
        employeeId: t.employee_id || t.employeeId || "",
        designation: t.designation || "Teacher",
        department: t.department || "Teaching",
        is_free: true,
      })),
    });
  } catch (err) {
    console.error("getAvailableSubstitutes error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const assignSubstitution = async (req, res) => {
  try {
    const {
      academic_session,
      substitution_date,
      weekday,
      period_number,
      period_id,
      class_name,
      section,
      subject_name,
      original_teacher_id,
      original_teacher_name,
      substitute_teacher_id,
      substitute_teacher_name,
      reason,
    } = req.body;

    if (
      !substitution_date ||
      !weekday ||
      period_number === undefined ||
      !class_name ||
      !substitute_teacher_id ||
      !substitute_teacher_name
    ) {
      return res.status(400).json({
        success: false,
        message: "Date, weekday, period number, class, and substitute teacher are required.",
      });
    }

    const store = readLocalStore();
    const session = academic_session || store.settings?.academic_session || "2026-27";
    const pNum = Number(period_number);
    const dateStr = substitution_date.trim();

    // Verify substitute teacher is not busy in master routine in this period on this weekday
    const isBusyMaster = (store.entries || []).some(
      (e) =>
        e.academic_session === session &&
        e.weekday === weekday &&
        Number(e.period_number) === pNum &&
        String(e.teacher_id) === String(substitute_teacher_id)
    );

    if (isBusyMaster) {
      return res.status(409).json({
        success: false,
        message: `Teacher ${substitute_teacher_name} already has a regular teaching class in Period ${pNum} on ${weekday}.`,
      });
    }

    // Verify substitute teacher is not already taking another proxy on this date & period
    const isBusySub = (store.substitutions || []).some(
      (s) =>
        s.substitution_date === dateStr &&
        Number(s.period_number) === pNum &&
        s.status !== "cancelled" &&
        String(s.substitute_teacher_id) === String(substitute_teacher_id)
    );

    if (isBusySub) {
      return res.status(409).json({
        success: false,
        message: `Teacher ${substitute_teacher_name} is already assigned as a substitute in Period ${pNum} on ${dateStr}.`,
      });
    }

    const newSub = {
      id: `sub-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      academic_session: session,
      substitution_date: dateStr,
      weekday,
      period_number: pNum,
      period_id: period_id || null,
      class_name: String(class_name),
      section: (section || "A").toUpperCase(),
      subject_name: subject_name || "General Subject",
      original_teacher_id: original_teacher_id || null,
      original_teacher_name: original_teacher_name || "Regular Faculty",
      substitute_teacher_id,
      substitute_teacher_name: substitute_teacher_name.trim(),
      reason: reason || "Faculty on leave / absent",
      status: "assigned",
      assigned_by: req.user?.fullName || req.user?.name || "Admin",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Remove any previous substitution for this exact class, section, date, period
    store.substitutions = (store.substitutions || []).filter(
      (s) =>
        !(
          s.substitution_date === dateStr &&
          Number(s.period_number) === pNum &&
          String(s.class_name).toLowerCase() === String(class_name).toLowerCase() &&
          String(s.section).toUpperCase() === (section || "A").toUpperCase()
        )
    );

    store.substitutions.push(newSub);
    saveLocalStore(store);

    logTimetableAudit("ASSIGN_SUBSTITUTE", req.user?.fullName || "Admin", session, {
      substitution_date: dateStr,
      class_name,
      section,
      period_number: pNum,
      substitute_teacher_name,
      original_teacher_name,
    });

    return res.json({
      success: true,
      message: `Substitute teacher ${substitute_teacher_name} successfully assigned for Period ${pNum} on ${dateStr}.`,
      substitution: newSub,
    });
  } catch (err) {
    console.error("assignSubstitution error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteSubstitution = async (req, res) => {
  try {
    const { id } = req.params;
    const store = readLocalStore();
    const existing = (store.substitutions || []).find((s) => s.id === id);

    if (!existing) {
      return res.status(404).json({ success: false, message: "Substitution record not found." });
    }

    store.substitutions = store.substitutions.filter((s) => s.id !== id);
    saveLocalStore(store);

    logTimetableAudit("CANCEL_SUBSTITUTE", req.user?.fullName || "Admin", existing.academic_session, {
      id,
      date: existing.substitution_date,
      period: existing.period_number,
    });

    return res.json({
      success: true,
      message: "Temporary substitution removed. Period reverted to regular master routine.",
    });
  } catch (err) {
    console.error("deleteSubstitution error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ============================================================================
   7. PERMANENT FACULTY REPLACEMENT (When a Teacher leaves & a New Teacher joins)
   ============================================================================ */

export const replaceFacultyInRoutine = async (req, res) => {
  try {
    const {
      academic_session,
      outgoing_teacher_id,
      outgoing_teacher_name,
      incoming_teacher_id,
      incoming_teacher_name,
      class_filter,
      force = false,
    } = req.body;

    if (!outgoing_teacher_id || !incoming_teacher_id || !incoming_teacher_name) {
      return res.status(400).json({
        success: false,
        message: "Outgoing teacher and incoming teacher details are required.",
      });
    }

    if (String(outgoing_teacher_id) === String(incoming_teacher_id)) {
      return res.status(400).json({
        success: false,
        message: "Outgoing and incoming teachers cannot be the same.",
      });
    }

    const store = readLocalStore();
    const session = academic_session || store.settings?.academic_session || "2026-27";

    // 1. Identify slots taught by the outgoing teacher
    const targetSlots = (store.entries || []).filter((e) => {
      if (e.academic_session !== session) return false;
      if (String(e.teacher_id) !== String(outgoing_teacher_id)) return false;
      if (class_filter && class_filter !== "All" && String(e.class_name).toLowerCase() !== String(class_filter).toLowerCase()) {
        return false;
      }
      return true;
    });

    if (targetSlots.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No timetable periods found for the selected outgoing teacher to replace.",
      });
    }

    // 2. Conflict Check: Does incoming teacher already have conflicting slots in the same periods?
    const collisions = [];
    for (const slot of targetSlots) {
      const existingBusy = (store.entries || []).find(
        (e) =>
          e.academic_session === session &&
          e.weekday === slot.weekday &&
          Number(e.period_number) === Number(slot.period_number) &&
          String(e.teacher_id) === String(incoming_teacher_id) &&
          e.id !== slot.id
      );

      if (existingBusy) {
        collisions.push({
          weekday: slot.weekday,
          period_number: slot.period_number,
          conflictingClass: `${existingBusy.class_name}-${existingBusy.section}`,
          subject: existingBusy.subject_name,
          targetClass: `${slot.class_name}-${slot.section}`,
        });
      }
    }

    if (collisions.length > 0 && !force) {
      return res.status(409).json({
        success: false,
        message: `Cannot handover: New teacher ${incoming_teacher_name} already has ${collisions.length} conflicting class period(s).`,
        conflicts: collisions,
      });
    }

    // 3. Perform bulk replacement across master routine entries
    let replacedCount = 0;
    store.entries = (store.entries || []).map((e) => {
      if (e.academic_session !== session) return e;
      if (String(e.teacher_id) !== String(outgoing_teacher_id)) return e;
      if (class_filter && class_filter !== "All" && String(e.class_name).toLowerCase() !== String(class_filter).toLowerCase()) {
        return e;
      }

      replacedCount++;
      return {
        ...e,
        teacher_id: incoming_teacher_id,
        teacher_name: incoming_teacher_name.trim(),
        updated_by: req.user?.fullName || req.user?.name || "Admin",
        updated_at: new Date().toISOString(),
      };
    });

    saveLocalStore(store);

    logTimetableAudit("REPLACE_FACULTY", req.user?.fullName || "Admin", session, {
      outgoing_teacher_id,
      outgoing_teacher_name,
      incoming_teacher_id,
      incoming_teacher_name,
      replacedSlotsCount: replacedCount,
    });

    return res.json({
      success: true,
      message: `Successfully transferred ${replacedCount} period(s) from ${outgoing_teacher_name || "previous faculty"} to ${incoming_teacher_name}.`,
      replacedCount,
    });
  } catch (err) {
    console.error("replaceFacultyInRoutine error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
