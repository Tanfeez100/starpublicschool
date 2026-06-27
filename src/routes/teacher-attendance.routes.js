import express from "express";
import { supabase } from "../services/supabase.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CHECKOUT_REASONS = new Set([
  "Forgot Checkout",
  "Location Problem",
  "Network Issue",
  "Emergency",
  "Other",
]);

const sendError = (res, status, message, extra = {}) =>
  res.status(status).json({ success: false, message, ...extra });

const sanitizeString = (value) =>
  typeof value === "string" ? value.trim() : value;

const normalizeDate = (value, field = "date") => {
  const normalized = sanitizeString(value);
  if (!normalized || !DATE_REGEX.test(normalized)) {
    const err = new Error(`${field} must be in YYYY-MM-DD format`);
    err.status = 400;
    throw err;
  }
  return normalized;
};

const isSchemaMissing = (error) => {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return text.includes("schema cache") || text.includes("pgrst205") || text.includes("could not find the table") || text.includes("relation");
};

const toHumanErrorMessage = (errorOrMessage, fallback = "Request failed") => {
  const raw =
    typeof errorOrMessage === "string"
      ? errorOrMessage
      : errorOrMessage?.message || fallback;
  const text = String(raw || "").toLowerCase();

  if (text.includes("row-level security") || text.includes("violates row-level security")) {
    return "Permission issue hai. Database policy is action ko allow nahi kar rahi.";
  }

  if (text.includes("schema cache") || text.includes("pgrst205") || text.includes("could not find the table") || text.includes("relation")) {
    return "Teacher attendance tables Supabase me visible nahi hain. Schema reload karke dobara try karein.";
  }

  if (text.includes("duplicate key") || text.includes("23505")) {
    return "Aaj ka attendance pehle se start ho chuka hai.";
  }

  return raw || fallback;
};

const getIndiaDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}`,
  };
};

const todayInIndia = () => getIndiaDateParts().date;
const nowTimeInIndia = () => getIndiaDateParts().time;

const minutesSinceMidnight = (time = "00:00") => {
  const [hours = 0, minutes = 0] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
};

const toNumber = (value, field) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    const err = new Error(`${field} is required`);
    err.status = 400;
    throw err;
  }
  return numeric;
};

const toOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toRadians = (degree) => (degree * Math.PI) / 180;

const getDistanceMeters = (from, to) => {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const normalizeSettings = (settings) => {
  if (!settings) return null;
  return {
    ...settings,
    latitude: Number(settings.latitude),
    longitude: Number(settings.longitude),
    radius_meters: Number(settings.radius_meters || 150),
    gps_accuracy_meters: Number(settings.gps_accuracy_meters || 80),
    grace_minutes: Number(settings.grace_minutes || 0),
    minimum_working_minutes: Number(settings.minimum_working_minutes || 0),
    late_after_minutes: Number(settings.late_after_minutes || settings.grace_minutes || 0),
  };
};

const getActiveSettings = async () => {
  const { data, error } = await supabase
    .from("teacher_attendance_settings")
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return normalizeSettings(data);
};

const validateCampusLocation = (settings, location = {}) => {
  if (!settings?.latitude || !settings?.longitude) {
    const err = new Error("School location settings configure nahi hai.");
    err.status = 400;
    throw err;
  }

  const latitude = toNumber(location.latitude, "latitude");
  const longitude = toNumber(location.longitude, "longitude");
  const accuracy = toOptionalNumber(location.accuracy);
  const distance = getDistanceMeters(
    { latitude: settings.latitude, longitude: settings.longitude },
    { latitude, longitude },
  );

  if (accuracy !== null && accuracy > settings.gps_accuracy_meters) {
    const err = new Error(`Location accuracy weak hai (${Math.round(accuracy)}m). ${settings.gps_accuracy_meters}m ke andar accurate location required hai.`);
    err.status = 400;
    err.detail = { accuracy, allowedAccuracy: settings.gps_accuracy_meters };
    throw err;
  }

  if (distance > settings.radius_meters) {
    const err = new Error("You are outside school campus.");
    err.status = 400;
    err.detail = { distanceMeters: Math.round(distance), radiusMeters: settings.radius_meters };
    throw err;
  }

  return { latitude, longitude, accuracy, distance };
};

const getWorkingMinutes = (checkInAt, checkOutAt) => {
  const start = new Date(checkInAt).getTime();
  const end = new Date(checkOutAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 60000);
};

const statusAfterCheckout = (record, settings, checkOutAt) => {
  const workingMinutes = getWorkingMinutes(record.check_in_at, checkOutAt);
  if (workingMinutes < settings.minimum_working_minutes) return "half_day";

  const checkIn = new Date(record.check_in_at);
  const indiaTime = getIndiaDateParts(checkIn).time;
  const lateCutoff = minutesSinceMidnight(settings.school_start_time) + settings.late_after_minutes;
  return minutesSinceMidnight(indiaTime) > lateCutoff ? "late" : "present";
};

const writeAudit = async ({ action, attendanceId = null, teacherId = null, actor = null, oldData = null, newData = null }) => {
  const { error } = await supabase.from("teacher_attendance_audit_logs").insert([
    {
      attendance_id: attendanceId,
      teacher_id: teacherId,
      action,
      old_data: oldData,
      new_data: newData,
      actor_id: actor?.id || null,
      actor_role: actor?.role || null,
    },
  ]);
  if (error) console.warn("Teacher attendance audit skipped:", error.message);
};

const assertTeacherActive = async (teacherId) => {
  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("id, status, full_name, employee_id, email, mobile")
    .eq("id", teacherId)
    .maybeSingle();

  if (error) {
    if (isSchemaMissing(error)) return null;
    throw error;
  }

  if (data?.status === "inactive") {
    const err = new Error("Inactive teachers attendance mark nahi kar sakte.");
    err.status = 403;
    throw err;
  }

  return data;
};

const enrichTeacherProfiles = async (rows = []) => {
  const teacherIds = [...new Set((rows || []).map((row) => row.teacher_id).filter(Boolean))];
  if (!teacherIds.length) return rows || [];

  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("id, full_name, employee_id, mobile, email, username, status")
    .in("id", teacherIds);

  if (error) {
    if (isSchemaMissing(error)) return rows || [];
    throw error;
  }

  const profileById = new Map((data || []).map((profile) => [profile.id, profile]));
  return (rows || []).map((row) => ({
    ...row,
    teacher_profiles: profileById.get(row.teacher_id) || null,
  }));
};

const markCheckoutMissing = async (teacherId = null) => {
  const settings = await getActiveSettings().catch(() => null);
  if (!settings) return [];

  const today = todayInIndia();
  const nowTime = nowTimeInIndia();
  let query = supabase
    .from("teacher_attendance_records")
    .select("*")
    .eq("status", "present_provisional")
    .is("check_out_at", null)
    .lte("attendance_date", today);

  if (teacherId) query = query.eq("teacher_id", teacherId);

  const { data, error } = await query;
  if (error) throw error;

  const expired = (data || []).filter((record) => {
    if (record.attendance_date < today) return true;
    return nowTime >= String(settings.checkout_deadline || "23:59").slice(0, 5);
  });

  const updated = [];
  for (const record of expired) {
    const { data: saved, error: updateError } = await supabase
      .from("teacher_attendance_records")
      .update({
        status: "checkout_missing",
        checkout_request_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", record.id)
      .select("*")
      .single();

    if (updateError) throw updateError;
    updated.push(saved);
    await writeAudit({
      action: "checkout_missing_auto",
      attendanceId: record.id,
      teacherId: record.teacher_id,
      oldData: record,
      newData: saved,
      actor: { id: null, role: "system" },
    });
  }

  return updated;
};

const applyTeacherScope = (query, req) => {
  if (req.user.role === "teacher") return query.eq("teacher_id", req.user.id);
  if (req.query.teacher_id) return query.eq("teacher_id", sanitizeString(req.query.teacher_id));
  return query;
};

const YEAR_REGEX = /^\d{4}$/;
const WORKING_STATUSES = new Set(["present", "late", "half_day", "present_provisional"]);
const HISTORY_STATUSES = [
  "present",
  "late",
  "half_day",
  "absent",
  "leave",
  "checkout_missing",
  "holiday",
  "rejected",
  "present_provisional",
];

const normalizeYear = (value, field = "year") => {
  const normalized = sanitizeString(value);
  if (!normalized || !YEAR_REGEX.test(normalized)) {
    const err = new Error(`${field} must be in YYYY format`);
    err.status = 400;
    throw err;
  }
  return normalized;
};

const resolveRecordsRange = (req) => {
  if (req.query.year) {
    const year = normalizeYear(req.query.year);
    return { from: `${year}-01-01`, to: `${year}-12-31`, year };
  }

  const from = req.query.from ? normalizeDate(req.query.from, "from") : todayInIndia().slice(0, 8) + "01";
  const to = req.query.to ? normalizeDate(req.query.to, "to") : todayInIndia();
  return { from, to, year: null };
};

const createEmptyHistoryBucket = (key) => ({
  key,
  total_records: 0,
  working_days: 0,
  present: 0,
  late: 0,
  half_day: 0,
  absent: 0,
  leave: 0,
  checkout_missing: 0,
  holiday: 0,
  rejected: 0,
  present_provisional: 0,
});

const buildHistorySummary = (records = []) => {
  const summary = createEmptyHistoryBucket("summary");
  const monthly = new Map();
  const yearly = new Map();

  for (const record of records || []) {
    const status = String(record?.status || "").toLowerCase();
    const date = sanitizeString(record?.attendance_date) || "";
    const monthKey = date.slice(0, 7);
    const yearKey = date.slice(0, 4);
    const isWorkingDay = WORKING_STATUSES.has(status);

    summary.total_records += 1;
    if (status && Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    }
    if (isWorkingDay) summary.working_days += 1;

    if (monthKey.length === 7) {
      const bucket = monthly.get(monthKey) || createEmptyHistoryBucket(monthKey);
      bucket.total_records += 1;
      if (status && Object.prototype.hasOwnProperty.call(bucket, status)) {
        bucket[status] += 1;
      }
      if (isWorkingDay) bucket.working_days += 1;
      monthly.set(monthKey, bucket);
    }

    if (yearKey.length === 4) {
      const bucket = yearly.get(yearKey) || createEmptyHistoryBucket(yearKey);
      bucket.total_records += 1;
      if (status && Object.prototype.hasOwnProperty.call(bucket, status)) {
        bucket[status] += 1;
      }
      if (isWorkingDay) bucket.working_days += 1;
      yearly.set(yearKey, bucket);
    }
  }

  const sortByKey = (left, right) => String(left.key).localeCompare(String(right.key));

  return {
    summary,
    monthlySummary: [...monthly.values()].sort(sortByKey),
    yearlySummary: [...yearly.values()].sort(sortByKey),
    statusOrder: HISTORY_STATUSES,
  };
};

router.use(authenticate, authorize("admin", "teacher"));

router.get("/settings", async (req, res) => {
  try {
    const settings = await getActiveSettings();
    res.json({ success: true, settings });
  } catch (err) {
    console.error("Teacher attendance settings error:", err);
    sendError(res, 500, toHumanErrorMessage(err, "Failed to load teacher attendance settings"));
  }
});

router.put("/settings", authorize("admin"), async (req, res) => {
  try {
    const payload = {
      school_name: sanitizeString(req.body.school_name) || "Star Public School",
      latitude: toNumber(req.body.latitude, "latitude"),
      longitude: toNumber(req.body.longitude, "longitude"),
      radius_meters: Number(req.body.radius_meters || 150),
      gps_accuracy_meters: Number(req.body.gps_accuracy_meters || 80),
      school_start_time: sanitizeString(req.body.school_start_time) || "07:00",
      school_end_time: sanitizeString(req.body.school_end_time) || "13:00",
      grace_minutes: Number(req.body.grace_minutes || 0),
      checkout_deadline: sanitizeString(req.body.checkout_deadline) || "14:00",
      minimum_working_minutes: Number(req.body.minimum_working_minutes || 180),
      late_after_minutes: Number(req.body.late_after_minutes || req.body.grace_minutes || 0),
      is_active: true,
      updated_at: new Date().toISOString(),
      updated_by: req.user.id,
    };

    await supabase
      .from("teacher_attendance_settings")
      .update({ is_active: false, updated_at: new Date().toISOString(), updated_by: req.user.id })
      .eq("is_active", true);

    const { data, error } = await supabase
      .from("teacher_attendance_settings")
      .insert([{ ...payload, created_by: req.user.id }])
      .select("*")
      .single();

    if (error) throw error;
    res.json({ success: true, message: "Teacher attendance settings saved.", settings: normalizeSettings(data) });
  } catch (err) {
    console.error("Save teacher attendance settings error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to save teacher attendance settings"), err.detail ? { detail: err.detail } : {});
  }
});

router.get("/today", async (req, res) => {
  try {
    const teacherId = req.user.role === "teacher" ? req.user.id : sanitizeString(req.query.teacher_id || req.user.id);
    const attendanceDate = normalizeDate(req.query.date || todayInIndia());
    await markCheckoutMissing(req.user.role === "teacher" ? teacherId : null);

    const [settingsResult, profileResult, recordResult, pendingResult] = await Promise.all([
      getActiveSettings()
        .then((settings) => ({ settings, error: null }))
        .catch((error) => ({ settings: null, error })),
      assertTeacherActive(teacherId).catch(() => null),
      supabase
        .from("teacher_attendance_records")
        .select("*")
        .eq("teacher_id", teacherId)
        .eq("attendance_date", attendanceDate)
        .maybeSingle(),
      supabase
        .from("teacher_attendance_records")
        .select("*")
        .eq("teacher_id", teacherId)
        .eq("status", "checkout_missing")
        .eq("checkout_request_status", "pending")
        .order("attendance_date", { ascending: true }),
    ]);

    if (recordResult.error) throw recordResult.error;
    if (pendingResult.error) throw pendingResult.error;

    res.json({
      success: true,
      date: attendanceDate,
      settings: settingsResult.settings,
      settings_error: settingsResult.error ? toHumanErrorMessage(settingsResult.error, "Failed to load teacher attendance settings") : null,
      profile: profileResult,
      attendance: recordResult.data || null,
      pendingCheckout: pendingResult.data || [],
    });
  } catch (err) {
    console.error("Teacher attendance today error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to load today's teacher attendance"));
  }
});

router.post("/check-in", authorize("teacher"), async (req, res) => {
  try {
    await assertTeacherActive(req.user.id);
    const attendanceDate = normalizeDate(req.body.date || todayInIndia());
    await markCheckoutMissing(req.user.id);

    const pending = await supabase
      .from("teacher_attendance_records")
      .select("id, attendance_date")
      .eq("teacher_id", req.user.id)
      .eq("status", "checkout_missing")
      .eq("checkout_request_status", "pending")
      .limit(1);

    if (pending.error) throw pending.error;
    if (pending.data?.length) {
      return sendError(res, 409, "Pending checkout explanation submit karna zaruri hai.", { pendingCheckout: pending.data });
    }

    const settings = await getActiveSettings();
    const location = validateCampusLocation(settings, req.body.location || req.body);
    const now = new Date().toISOString();
    const checkInTime = nowTimeInIndia();
    const lateCutoff = minutesSinceMidnight(settings.school_start_time) + settings.late_after_minutes;
    const isLate = minutesSinceMidnight(checkInTime) > lateCutoff;

    const row = {
      teacher_id: req.user.id,
      school_id: settings.school_id || null,
      attendance_date: attendanceDate,
      status: isLate ? "late" : "present_provisional",
      check_in_at: now,
      check_in_latitude: location.latitude,
      check_in_longitude: location.longitude,
      check_in_accuracy: location.accuracy,
      check_in_distance_meters: Math.round(location.distance * 100) / 100,
      device_id: sanitizeString(req.body.device_id) || null,
      created_by: req.user.id,
      updated_by: req.user.id,
    };

    const { data, error } = await supabase
      .from("teacher_attendance_records")
      .insert([row])
      .select("*")
      .single();

    if (error) throw error;
    await writeAudit({ action: "check_in", attendanceId: data.id, teacherId: req.user.id, actor: req.user, newData: data });

    res.status(201).json({ success: true, message: "Check in saved.", attendance: data, settings });
  } catch (err) {
    console.error("Teacher check-in error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Check in failed"), err.detail ? { detail: err.detail } : {});
  }
});

router.post("/check-out", authorize("teacher"), async (req, res) => {
  try {
    const attendanceDate = normalizeDate(req.body.date || todayInIndia());
    const settings = await getActiveSettings();
    const location = validateCampusLocation(settings, req.body.location || req.body);

    const { data: record, error: fetchError } = await supabase
      .from("teacher_attendance_records")
      .select("*")
      .eq("teacher_id", req.user.id)
      .eq("attendance_date", attendanceDate)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!record) return sendError(res, 400, "Check in record nahi mila.");
    if (record.check_out_at) return sendError(res, 409, "Checkout already saved hai.");
    if (record.status === "checkout_missing") return sendError(res, 409, "Checkout deadline miss ho chuki hai. Explanation submit karein.");

    const now = new Date().toISOString();
    const nextStatus = statusAfterCheckout(record, settings, now);
    const workingMinutes = getWorkingMinutes(record.check_in_at, now);
    const payload = {
      status: nextStatus,
      check_out_at: now,
      check_out_latitude: location.latitude,
      check_out_longitude: location.longitude,
      check_out_accuracy: location.accuracy,
      check_out_distance_meters: Math.round(location.distance * 100) / 100,
      working_minutes: workingMinutes,
      updated_at: now,
      updated_by: req.user.id,
    };

    const { data, error } = await supabase
      .from("teacher_attendance_records")
      .update(payload)
      .eq("id", record.id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAudit({ action: "check_out", attendanceId: data.id, teacherId: req.user.id, actor: req.user, oldData: record, newData: data });

    res.json({ success: true, message: "Check out saved.", attendance: data, settings });
  } catch (err) {
    console.error("Teacher check-out error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Check out failed"), err.detail ? { detail: err.detail } : {});
  }
});

router.post("/checkout-explanations/:id", authorize("teacher"), async (req, res) => {
  try {
    const reason = sanitizeString(req.body.reason);
    const remarks = sanitizeString(req.body.remarks || req.body.explanation);
    if (!CHECKOUT_REASONS.has(reason)) return sendError(res, 400, "Valid reason required hai.");
    if (reason === "Other" && !remarks) return sendError(res, 400, "Other reason ke liye remarks required hai.");

    const { data: record, error: fetchError } = await supabase
      .from("teacher_attendance_records")
      .select("*")
      .eq("id", req.params.id)
      .eq("teacher_id", req.user.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!record) return sendError(res, 400, "Checkout missing record nahi mila.");
    if (record.status !== "checkout_missing") return sendError(res, 400, "Ye record checkout missing state me nahi hai.");

    const { data, error } = await supabase
      .from("teacher_attendance_records")
      .update({
        checkout_missing_reason: reason,
        checkout_missing_remarks: remarks || null,
        checkout_request_status: "pending",
        updated_at: new Date().toISOString(),
        updated_by: req.user.id,
      })
      .eq("id", record.id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAudit({ action: "checkout_explanation_submitted", attendanceId: data.id, teacherId: req.user.id, actor: req.user, oldData: record, newData: data });
    res.json({ success: true, message: "Checkout explanation submitted.", attendance: data });
  } catch (err) {
    console.error("Checkout explanation error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Checkout explanation submit failed"));
  }
});

router.patch("/checkout-requests/:id/review", authorize("admin"), async (req, res) => {
  try {
    const decision = sanitizeString(req.body.decision);
    const statusMap = {
      approve_present: "present",
      mark_half_day: "half_day",
      mark_absent: "absent",
      reject: "rejected",
    };
    const nextStatus = statusMap[decision];
    if (!nextStatus) return sendError(res, 400, "Valid admin decision required hai.");

    const { data: record, error: fetchError } = await supabase
      .from("teacher_attendance_records")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!record) return sendError(res, 400, "Checkout request nahi mila.");

    const payload = {
      status: nextStatus,
      checkout_request_status: decision === "reject" ? "rejected" : "approved",
      admin_remarks: sanitizeString(req.body.admin_remarks) || null,
      decided_by: req.user.id,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: req.user.id,
    };

    const { data, error } = await supabase
      .from("teacher_attendance_records")
      .update(payload)
      .eq("id", record.id)
      .select("*")
      .single();

    if (error) throw error;
    await writeAudit({ action: "checkout_reviewed", attendanceId: data.id, teacherId: data.teacher_id, actor: req.user, oldData: record, newData: data });
    res.json({ success: true, message: "Checkout request reviewed.", attendance: data });
  } catch (err) {
    console.error("Checkout review error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Checkout review failed"));
  }
});

router.get("/records", async (req, res) => {
  try {
    await markCheckoutMissing(req.user.role === "teacher" ? req.user.id : null);
    const { from, to, year } = resolveRecordsRange(req);

    let query = supabase
      .from("teacher_attendance_records")
      .select("*")
      .gte("attendance_date", from)
      .lte("attendance_date", to)
      .order("attendance_date", { ascending: false })
      .order("created_at", { ascending: false });

    query = applyTeacherScope(query, req);
    if (req.query.status) query = query.eq("status", sanitizeString(req.query.status));

    const { data, error } = await query;
    if (error) throw error;

    const records = await enrichTeacherProfiles(data || []);
    const history = buildHistorySummary(records);

    res.json({
      success: true,
      count: records.length,
      range: { from, to, year },
      summary: history.summary,
      monthlySummary: history.monthlySummary,
      yearlySummary: history.yearlySummary,
      statusOrder: history.statusOrder,
      records,
    });
  } catch (err) {
    console.error("Teacher attendance records error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to fetch teacher attendance records"));
  }
});

router.get("/pending-checkout", async (req, res) => {
  try {
    await markCheckoutMissing(req.user.role === "teacher" ? req.user.id : null);
    let query = supabase
      .from("teacher_attendance_records")
      .select("*")
      .eq("status", "checkout_missing")
      .eq("checkout_request_status", "pending")
      .order("attendance_date", { ascending: true });

    query = applyTeacherScope(query, req);
    const { data, error } = await query;
    if (error) throw error;
    const requests = await enrichTeacherProfiles(data || []);
    res.json({ success: true, count: requests.length, requests });
  } catch (err) {
    console.error("Pending checkout error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to fetch pending checkout requests"));
  }
});

router.post("/leave-requests", authorize("teacher"), async (req, res) => {
  try {
    const payload = {
      teacher_id: req.user.id,
      leave_type: sanitizeString(req.body.leave_type || req.body.leaveType) || "Casual Leave",
      from_date: normalizeDate(req.body.from_date || req.body.fromDate, "from_date"),
      to_date: normalizeDate(req.body.to_date || req.body.toDate, "to_date"),
      reason: sanitizeString(req.body.reason),
      status: "pending",
      created_by: req.user.id,
      updated_by: req.user.id,
    };

    if (!payload.reason) return sendError(res, 400, "Leave reason required hai.");
    if (payload.to_date < payload.from_date) return sendError(res, 400, "To date from date se pehle nahi ho sakti.");

    const { data, error } = await supabase
      .from("teacher_leave_requests")
      .insert([payload])
      .select("*")
      .single();

    if (error) throw error;
    res.status(201).json({ success: true, message: "Leave request submitted.", leave: data });
  } catch (err) {
    console.error("Teacher leave request error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Leave request failed"));
  }
});

router.get("/leave-requests", async (req, res) => {
  try {
    let query = supabase
      .from("teacher_leave_requests")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (req.user.role === "teacher") query = query.eq("teacher_id", req.user.id);
    if (req.query.status) query = query.eq("status", sanitizeString(req.query.status));

    const { data, error } = await query;
    if (error) throw error;
    const leaves = await enrichTeacherProfiles(data || []);
    res.json({ success: true, count: leaves.length, leaves });
  } catch (err) {
    console.error("Teacher leaves error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Failed to fetch teacher leaves"));
  }
});

router.patch("/leave-requests/:id", authorize("admin"), async (req, res) => {
  try {
    const status = sanitizeString(req.body.status);
    if (!["approved", "rejected"].includes(status)) return sendError(res, 400, "Leave status approved ya rejected hona chahiye.");

    const { data: leave, error: fetchError } = await supabase
      .from("teacher_leave_requests")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!leave) return sendError(res, 400, "Leave request nahi mila.");

    const { data, error } = await supabase
      .from("teacher_leave_requests")
      .update({
        status,
        admin_remarks: sanitizeString(req.body.admin_remarks) || null,
        decided_by: req.user.id,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: req.user.id,
      })
      .eq("id", leave.id)
      .select("*")
      .single();

    if (error) throw error;

    if (status === "approved") {
      const rows = [];
      const current = new Date(`${leave.from_date}T00:00:00.000Z`);
      const end = new Date(`${leave.to_date}T00:00:00.000Z`);
      while (current <= end) {
        rows.push({
          teacher_id: leave.teacher_id,
          attendance_date: current.toISOString().slice(0, 10),
          status: "leave",
          created_by: req.user.id,
          updated_by: req.user.id,
        });
        current.setUTCDate(current.getUTCDate() + 1);
      }
      await supabase
        .from("teacher_attendance_records")
        .upsert(rows, { onConflict: "teacher_id,attendance_date" });
    }

    res.json({ success: true, message: "Leave request updated.", leave: data });
  } catch (err) {
    console.error("Teacher leave review error:", err);
    sendError(res, err.status || 500, toHumanErrorMessage(err, "Leave review failed"));
  }
});

export default router;
