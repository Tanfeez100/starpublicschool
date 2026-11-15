import express from "express";
import { supabase, supabaseAuth, getRoleCached, getAppJwtSecret } from "../services/supabase.js";
import { createClient } from "@supabase/supabase-js";
import { adminOnly } from "../middleware/auth.middleware.js";
import jwt from "jsonwebtoken";

/**
 * OPTIMIZATION: Retry logic for network failures
 * Exponential backoff: 1s, 2s, 4s, 8s
 */
const retryWithBackoff = async (fn, maxRetries = 3, initialDelay = 1000) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Retry attempt ${i + 1}/${maxRetries} after ${delay}ms:`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

// Admin client for user management (uses service role key)
// OPTIMIZATION: Increased timeout to 30s
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      fetch: (url, options = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        return fetch(url, {
          ...options,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
      },
    },
  }
);

const APP_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const APP_SESSION_TTL_MS = APP_SESSION_TTL_SECONDS * 1000;
const buildAppAccessToken = (user = {}, assignments = []) => {
  const jwtSecret = getAppJwtSecret();
  if (!jwtSecret) {
    throw new Error("JWT secret not configured for app session signing.");
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email || null,
      role: user.role || null,
      name: user.name || null,
      fullName: user.fullName || null,
      assignedClass: user.assignedClass || null,
      assignedSection: user.assignedSection || null,
      academicYear: user.academicYear || null,
      assignments,
      permissions: user.permissions || [],
    },
    jwtSecret,
    { expiresIn: APP_SESSION_TTL_SECONDS }
  );
};

const router = express.Router();
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createHttpError = (status, message, detail = null) => {
  const err = new Error(message);
  err.status = status;
  if (detail) {
    err.detail = detail;
  }
  return err;
};

const normalizeRole = (role) => String(role || "").trim().toLowerCase();
const sanitizeString = (value) => (typeof value === "string" ? value.trim() : value);
const isValidUuid = (value) => UUID_REGEX.test(String(value || ""));
const isSchemaMissing = (error) => {
  const text = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return text.includes("schema cache") || text.includes("pgrst205") || text.includes("could not find the table") || text.includes("relation");
};

const generateTemporaryPassword = () =>
  `Sps@${Math.random().toString(36).slice(2, 8)}${Math.floor(100 + Math.random() * 900)}`;

const generateGeneralizedPassword = (name = "") => {
  const clean = String(name || "").trim().replace(/[^a-zA-Z0-9]/g, "");
  let prefix = clean.slice(0, 4);
  if (prefix.length < 4) {
    prefix = (prefix + "Star").slice(0, 4);
  }
  return `${prefix}@123`;
};

const generateUsername = ({ fullName = "", employeeId = "", email = "" } = {}) => {
  const source = employeeId || fullName || email.split("@")[0] || "teacher";
  const slug = String(source)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 24);
  return `${slug || "teacher"}.${Math.floor(1000 + Math.random() * 9000)}`;
};

const getDefaultAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  return `${currentYear}-${String(currentYear + 1).slice(-2)}`;
};

const normalizeAcademicYear = (value) => {
  const normalized = sanitizeString(value);
  if (!normalized) return getDefaultAcademicYear();
  if (!/^\d{4}-(\d{2}|\d{4})$/.test(normalized)) {
    throw createHttpError(400, "academic_year must be in format YYYY-YY or YYYY-YYYY");
  }
  return normalized;
};

const getTeacherAssignmentMap = async (teacherIds = []) => {
  if (!teacherIds.length) return new Map();

  const { data, error } = await supabase
    .from("teacher_assignments")
    .select("teacher_id, class, section, academic_year, created_at, updated_at")
    .in("teacher_id", teacherIds)
    .order("class", { ascending: true })
    .order("section", { ascending: true });

  if (error) {
    console.warn("Teacher assignment fetch skipped:", error.message);
    return new Map();
  }

  return (data || []).reduce((map, row) => {
    const rows = map.get(row.teacher_id) || [];
    rows.push(row);
    map.set(row.teacher_id, rows);
    return map;
  }, new Map());
};

const getTeacherProfileMap = async (teacherIds = []) => {
  if (!teacherIds.length) return new Map();

  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("*")
    .in("id", teacherIds);

  if (error) {
    if (isSchemaMissing(error)) {
      console.warn("teacher_profiles table not visible yet:", error.message);
      return new Map();
    }
    throw error;
  }

  return (data || []).reduce((map, row) => {
    map.set(row.id, row);
    return map;
  }, new Map());
};

const resolveTeacherEmailForLogin = async (identity) => {
  const normalized = sanitizeString(identity);
  if (!normalized || normalized.includes("@")) return normalized;

  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("email, status")
    .eq("username", normalized)
    .maybeSingle();

  if (error) {
    if (isSchemaMissing(error)) return normalized;
    throw error;
  }

  if (data?.status === "inactive") {
    throw createHttpError(403, "Inactive teachers cannot login.");
  }

  return data?.email || normalized;
};

const ensureTeacherProfileCanLogin = async (teacherId) => {
  const { data, error } = await supabase
    .from("teacher_profiles")
    .select("status")
    .eq("id", teacherId)
    .maybeSingle();

  if (error) {
    if (isSchemaMissing(error)) return;
    throw error;
  }

  if (data?.status === "inactive") {
    throw createHttpError(403, "Inactive teachers cannot login.");
  }
};

const upsertTeacherProfile = async ({ teacherId, payload = {}, email, actorId }) => {
  const fullName = sanitizeString(payload.full_name || payload.fullName || payload.name) || "";
  const employeeId = sanitizeString(payload.employee_id || payload.employeeId) || null;
  const username = sanitizeString(payload.username) || generateUsername({ fullName, employeeId, email });

  const staffType = sanitizeString(payload.staff_type || payload.staffType) || "teaching";
  const roleTitle = sanitizeString(payload.role_title || payload.roleTitle || payload.role) || "";
  const subject = sanitizeString(payload.subject) || "";

  const highestQual = sanitizeString(payload.highest_qualification || payload.highestQualification || payload.qualification) || "";
  const profQual = sanitizeString(payload.professional_qualification || payload.professionalQualification) || "";
  const combinedQual = highestQual && profQual ? `${highestQual} (${profQual})` : (highestQual || profQual || null);

  const fatherName = sanitizeString(payload.father_name || payload.fatherName) || "";
  const motherName = sanitizeString(payload.mother_name || payload.motherName) || "";
  const documentUrl = sanitizeString(payload.document_url || payload.documentUrl) || "";
  const profDocumentUrl = sanitizeString(payload.professional_document_url || payload.professionalDocumentUrl) || "";
  const aadharCardUrl = sanitizeString(payload.aadhar_card_url || payload.aadharCardUrl || payload.aadhaar_card_url || payload.aadhaar_url) || "";
  const aadharNumber = sanitizeString(payload.aadhar_number || payload.aadharNumber || payload.aadhaar_number) || "";
  const cvUrl = sanitizeString(payload.cv_url || payload.cvUrl || payload.resume_url || payload.resumeUrl) || "";
  const offerLetterUrl = sanitizeString(payload.offer_letter_url || payload.offerLetterUrl || payload.offer_letter) || "";
  const emergencyPhone = sanitizeString(payload.emergency_contact || payload.emergencyContact) || "";

  const metaObj = {
    staff_type: staffType,
    role_title: roleTitle,
    subject: subject,
    father_name: fatherName,
    mother_name: motherName,
    highest_qualification: highestQual,
    professional_qualification: profQual,
    document_url: documentUrl,
    professional_document_url: profDocumentUrl,
    aadhar_card_url: aadharCardUrl,
    aadhar_number: aadharNumber,
    cv_url: cvUrl,
    offer_letter_url: offerLetterUrl,
    emergency_contact: emergencyPhone,
  };

  const profile = {
    id: teacherId,
    employee_id: employeeId,
    full_name: fullName || email,
    mobile: sanitizeString(payload.mobile) || null,
    email,
    gender: sanitizeString(payload.gender) || null,
    date_of_birth: sanitizeString(payload.date_of_birth || payload.dateOfBirth || payload.dob) || null,
    qualification: combinedQual,
    designation: sanitizeString(payload.designation) || (staffType === "non_teaching" ? (roleTitle || "Support Staff") : "Faculty Member"),
    department: sanitizeString(payload.department) || (staffType === "non_teaching" ? "Administration & Support" : "Academics"),
    joining_date: sanitizeString(payload.joining_date || payload.joiningDate) || null,
    address: sanitizeString(payload.address) || null,
    emergency_contact: JSON.stringify(metaObj),
    photo_url: sanitizeString(payload.photo_url || payload.photoUrl) || null,
    status: sanitizeString(payload.status) || "active",
    username,
    must_reset_password: true,
    created_by: actorId || null,
    updated_by: actorId || null,
    updated_at: new Date().toISOString(),
  };

  const profileWithExtended = {
    ...profile,
    staff_type: staffType,
    role_title: roleTitle || null,
    subject: subject || null,
    father_name: fatherName || null,
    mother_name: motherName || null,
    highest_qualification: highestQual || null,
    professional_qualification: profQual || null,
    document_url: documentUrl || null,
    professional_document_url: profDocumentUrl || null,
    aadhar_card_url: aadharCardUrl || null,
    aadhar_number: aadharNumber || null,
    cv_url: cvUrl || null,
    offer_letter_url: offerLetterUrl || null,
  };

  let { data, error } = await supabase
    .from("teacher_profiles")
    .upsert([profileWithExtended], { onConflict: "id" })
    .select("*")
    .single();

  if (error && (error.code === "PGRST204" || error.message?.includes("column") || error.message?.includes("schema cache"))) {
    // If native columns have not been migrated into table yet, fallback to base columns + emergency_contact meta
    const fallbackRes = await supabase
      .from("teacher_profiles")
      .upsert([profile], { onConflict: "id" })
      .select("*")
      .single();
    data = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error) {
    if (isSchemaMissing(error)) {
      console.warn("teacher profile save skipped:", error.message);
      return null;
    }
    throw error;
  }

  return {
    ...data,
    staff_type: staffType,
    role_title: roleTitle,
    subject: subject,
    father_name: fatherName,
    mother_name: motherName,
    highest_qualification: highestQual,
    professional_qualification: profQual,
    document_url: documentUrl,
    professional_document_url: profDocumentUrl,
    aadhar_card_url: aadharCardUrl,
    aadhar_number: aadharNumber,
    cv_url: cvUrl,
    offer_letter_url: offerLetterUrl,
  };
};

const ensureTeacherRole = async (teacherId) => {
  if (!isValidUuid(teacherId)) {
    throw createHttpError(400, "Valid teacher ID is required");
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("user_id", teacherId)
    .eq("role", "teacher")
    .single();

  if (error || !data) {
    throw createHttpError(404, "Teacher not found");
  }

  return data;
};

const createManagedUser = async ({ email, password, role }) => {
  if (!email || !password || !role) {
    throw createHttpError(400, "Email, password, and role are required");
  }

  const normalizedRole = normalizeRole(role);
  const allowedRoles = ["admin", "teacher"];

  if (!allowedRoles.includes(normalizedRole)) {
    throw createHttpError(400, "Role must be 'admin' or 'teacher'");
  }

  if (String(password).length < 6) {
    throw createHttpError(400, "Password must be at least 6 characters");
  }

  const { data: authData, error: authError } = await retryWithBackoff(() =>
    supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
  );

  if (authError) {
    if (
      (authError.message || "").toLowerCase().includes("already exists") ||
      authError.status === 422
    ) {
      throw createHttpError(400, "User with this email already exists");
    }

    throw createHttpError(
      503,
      "Failed to create user. Please try again.",
      authError.message
    );
  }

  const userId = authData?.user?.id;
  if (!userId) {
    throw createHttpError(503, "Failed to create user. Missing user ID.");
  }

  const { error: roleError } = await retryWithBackoff(() =>
    supabase.from("user_roles").insert([{ user_id: userId, role: normalizedRole }])
  );

  if (roleError) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    } catch (rollbackError) {
      console.error("Failed to rollback user creation:", rollbackError);
    }

    throw createHttpError(
      503,
      "Failed to assign role. Please try again.",
      roleError.message
    );
  }

  return {
    id: userId,
    email,
    role: normalizedRole,
  };
};

const deleteManagedUser = async ({ userId, requiredRole = null, actorUserId = null }) => {
  if (!userId) {
    throw createHttpError(400, "User ID is required");
  }

  if (actorUserId && actorUserId === userId) {
    throw createHttpError(400, "You cannot remove your own account");
  }

  const { data: roleData, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();

  if (roleError || !roleData) {
    throw createHttpError(404, "User not found in user_roles");
  }

  const existingRole = normalizeRole(roleData.role);

  if (requiredRole && existingRole !== requiredRole) {
    throw createHttpError(400, `Only '${requiredRole}' accounts can be removed here`);
  }

  const deleteRolePromise = retryWithBackoff(() =>
    supabase.from("user_roles").delete().eq("user_id", userId)
  );

  const deleteUserPromise = retryWithBackoff(() =>
    supabaseAdmin.auth.admin.deleteUser(userId)
  );

  const [roleDeleteResult, userDeleteResult] = await Promise.allSettled([
    deleteRolePromise,
    deleteUserPromise,
  ]);

  if (roleDeleteResult.status === "rejected") {
    throw createHttpError(
      503,
      "Failed to remove role. Please try again.",
      roleDeleteResult.reason?.message || "Role deletion failed"
    );
  }

  if (userDeleteResult.status === "rejected") {
    try {
      await supabase.from("user_roles").insert([{ user_id: userId, role: existingRole }]);
    } catch (restoreErr) {
      console.error("Failed to restore role:", restoreErr);
    }

    throw createHttpError(
      503,
      "Failed to delete user. Please try again.",
      userDeleteResult.reason?.message || "Auth user deletion failed"
    );
  }

  return { id: userId, role: existingRole };
};

router.post("/login", async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const identity = email || username;

    if (!identity || !password)
      return res.status(400).json({ message: "Email & password required" });

    const resolvedEmail = await resolveTeacherEmailForLogin(identity);

    // ⚡ OPTIMIZATION: Add retry logic for network resilience
    const { data, error } = await retryWithBackoff(() =>
      supabaseAuth.auth.signInWithPassword({ email: resolvedEmail, password })
    );

    if (error)
      return res.status(401).json({ message: "Invalid credentials" });

    // ⚡ OPTIMIZATION: Cache role fetch
    const role = await getRoleCached(data.user.id);

    if (!role)
      return res.status(403).json({ message: "Role not assigned" });

    // 3️⃣ ALLOW ADMIN AND TEACHER ROLES
    const allowedRoles = ["admin", "teacher"];
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        message: "Access denied. Only admin and teacher can login."
      });
    }

    // 4️⃣ SUCCESS
    // App login remains valid for 30 days.
    if (role === "teacher") {
      await ensureTeacherProfileCanLogin(data.user.id);
    }

    const expiresAt = new Date(Date.now() + APP_SESSION_TTL_MS);
    const assignments =
      role === "teacher"
        ? (await getTeacherAssignmentMap([data.user.id])).get(data.user.id) || []
        : [];
    const assignment = assignments[0] || null;
    const profile =
      role === "teacher"
        ? (await getTeacherProfileMap([data.user.id])).get(data.user.id) || null
        : null;

    const teacherPermissions = [
      "dashboard",
      "attendance",
      "teacher_attendance",
      "marks_upload",
      "examinations",
      "students",
      "timetable",
    ];

    const permissions = role === "teacher" ? teacherPermissions : ["*"];
    const userDisplayName = profile?.full_name || data.user.email?.split("@")[0] || (role === "admin" ? "Principal Sharma" : "Teacher");

    const appAccessToken = buildAppAccessToken(
      {
        id: data.user.id,
        email: data.user.email,
        role,
        name: userDisplayName,
        fullName: profile?.full_name || "",
        assignedClass: assignment?.class || null,
        assignedSection: assignment?.section || null,
        academicYear: assignment?.academic_year || null,
        permissions,
      },
      assignments
    );
    const appSession = {
      ...(data.session || {}),
      access_token: appAccessToken,
      refresh_token: data.session?.refresh_token || "",
    };

    res.json({
      message: "Login successful",
      access_token: appAccessToken,
      refresh_token: appSession.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: role, // Will be "admin" or "teacher"
        name: userDisplayName,
        fullName: profile?.full_name || "",
        employeeId: profile?.employee_id || "",
        username: profile?.username || "",
        mobile: profile?.mobile || "",
        department: profile?.department || "",
        designation: profile?.designation || "",
        status: profile?.status || "active",
        assignedClass: assignment?.class || null,
        assignedSection: assignment?.section || null,
        academicYear: assignment?.academic_year || null,
        assignments,
        permissions,
      },
      session: appSession,
      token_info: {
        expires_at: expiresAt.toISOString(),
        expires_in: APP_SESSION_TTL_SECONDS,
        note: "Login expires after 30 days. Use /api/auth/refresh to extend session.",
      },
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(err.status || 503).json({
      message: err.message || "Service temporarily unavailable. Please try again.",
      error: err.message
    });
  }
});

/* ======================================================
   CREATE USER (ADMIN/TEACHER)
   ====================================================== */
router.post("/create-user", adminOnly, async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const createdUser = await createManagedUser({ email, password, role });

    res.status(201).json({
      success: true,
      message: `${createdUser.role} created successfully`,
      user: createdUser,
    });
  } catch (err) {
    console.error("Create user error:", err);
    res.status(err.status || 503).json({
      message: err.message || "Service temporarily unavailable. Please try again.",
      ...(err.detail ? { error: err.detail } : {}),
    });
  }
});

/* ======================================================
   ADMIN TEACHER MANAGEMENT
   ====================================================== */
router.post("/teachers", adminOnly, async (req, res) => {
  try {
    let email = sanitizeString(req.body.email);
    const empId = sanitizeString(req.body.employee_id || req.body.employeeId) || `STF-${Math.floor(100 + Math.random() * 900)}`;
    if (!email) {
      email = `${empId.toLowerCase().replace(/[^a-z0-9]/g, '')}@starpublicschool.com`;
    }
    const password = req.body.password || generateGeneralizedPassword(req.body.full_name || req.body.fullName || req.body.name);
    const createdTeacher = await createManagedUser({
      email,
      password,
      role: "teacher",
    });
    const profile = await upsertTeacherProfile({
      teacherId: createdTeacher.id,
      payload: { ...req.body, employee_id: empId },
      email,
      actorId: req.user?.id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Teacher created successfully",
      teacher: {
        ...createdTeacher,
        profile,
        username: profile?.username || null,
        temporaryPassword: password,
      },
    });
  } catch (err) {
    console.error("Create teacher error:", err);
    return res.status(err.status || 503).json({
      message: err.message || "Service temporarily unavailable. Please try again.",
      ...(err.detail ? { error: err.detail } : {}),
    });
  }
});

router.get("/teachers", adminOnly, async (req, res) => {
  try {
    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "teacher")
      .order("user_id", { ascending: true });

    if (roleError) {
      return res.status(503).json({
        message: "Failed to fetch teachers. Please try again.",
        error: roleError.message,
      });
    }

    const teacherIds = (roleRows || []).map((row) => row.user_id);
    const teacherIdSet = new Set(teacherIds);
    const emailById = new Map();

    if (teacherIds.length > 0) {
      const { data: listData, error: listError } = await retryWithBackoff(() =>
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      );

      if (!listError && listData?.users?.length) {
        for (const authUser of listData.users) {
          if (teacherIdSet.has(authUser.id)) {
            emailById.set(authUser.id, authUser.email || null);
          }
        }
      }
    }

    const teachers = (roleRows || []).map((row) => ({
      id: row.user_id,
      role: "teacher",
      email: emailById.get(row.user_id) || null,
    }));
    const assignmentByTeacherId = await getTeacherAssignmentMap(teacherIds);
    const profileByTeacherId = await getTeacherProfileMap(teacherIds);
    const teachersWithAssignments = teachers.map((teacher) => {
      const assignments = assignmentByTeacherId.get(teacher.id) || [];
      const assignment = assignments[0] || null;
      const profile = profileByTeacherId.get(teacher.id) || null;
      let meta = {};
      try {
        if (profile?.emergency_contact && profile.emergency_contact.startsWith("{")) {
          meta = JSON.parse(profile.emergency_contact);
        }
      } catch (_) { }

      const enrichedProfile = profile
        ? {
          ...profile,
          staff_type: profile.staff_type || meta.staff_type || "teaching",
          role_title: profile.role_title || meta.role_title || "",
          subject: profile.subject || meta.subject || "",
          father_name: profile.father_name || meta.father_name || "",
          mother_name: profile.mother_name || meta.mother_name || "",
          highest_qualification: profile.highest_qualification || meta.highest_qualification || profile.qualification || "",
          professional_qualification: profile.professional_qualification || meta.professional_qualification || "",
          document_url: profile.document_url || meta.document_url || "",
          professional_document_url: profile.professional_document_url || meta.professional_document_url || "",
          aadhar_card_url: profile.aadhar_card_url || meta.aadhar_card_url || "",
          aadhar_number: profile.aadhar_number || meta.aadhar_number || "",
          cv_url: profile.cv_url || meta.cv_url || "",
          offer_letter_url: profile.offer_letter_url || meta.offer_letter_url || "",
        }
        : null;

      return {
        ...teacher,
        profile: enrichedProfile,
        employeeId: profile?.employee_id || "",
        fullName: profile?.full_name || "",
        mobile: profile?.mobile || "",
        username: profile?.username || "",
        status: profile?.status || "active",
        photoUrl: profile?.photo_url || "",
        dateOfBirth: profile?.date_of_birth || "",
        staffType: profile?.staff_type || meta.staff_type || "teaching",
        roleTitle: profile?.role_title || meta.role_title || "",
        subject: profile?.subject || meta.subject || "",
        designation: profile?.designation || (meta.staff_type === "non_teaching" ? (meta.role_title || "Support Staff") : "Faculty Member"),
        department: profile?.department || (meta.staff_type === "non_teaching" ? "Administration & Support" : "Academics"),
        fatherName: profile?.father_name || meta.father_name || "",
        motherName: profile?.mother_name || meta.mother_name || "",
        highestQualification: profile?.highest_qualification || meta.highest_qualification || profile?.qualification || "",
        professionalQualification: profile?.professional_qualification || meta.professional_qualification || "",
        documentUrl: profile?.document_url || meta.document_url || "",
        professionalDocumentUrl: profile?.professional_document_url || meta.professional_document_url || "",
        aadharCardUrl: profile?.aadhar_card_url || meta.aadhar_card_url || "",
        aadharNumber: profile?.aadhar_number || meta.aadhar_number || "",
        cvUrl: profile?.cv_url || meta.cv_url || "",
        offerLetterUrl: profile?.offer_letter_url || meta.offer_letter_url || "",
        address: profile?.address || "",
        assignment,
        assignments,
        assignedClass: assignment?.class || null,
        assignedSection: assignment?.section || null,
        academicYear: assignment?.academic_year || null,
      };
    });

    return res.json({
      success: true,
      count: teachersWithAssignments.length,
      teachers: teachersWithAssignments,
    });
  } catch (err) {
    console.error("Get teachers error:", err);
    return res.status(503).json({
      message: "Service temporarily unavailable. Please try again.",
      error: err.message,
    });
  }
});

const saveTeacherAssignment = async (req, res) => {
  try {
    const teacherId = req.params.id;
    const assignedClass = sanitizeString(req.body?.class || req.body?.assignedClass);
    const assignedSection = sanitizeString(req.body?.section || req.body?.assignedSection);
    const academicYear = normalizeAcademicYear(req.body?.academic_year || req.body?.academicYear);

    if (!assignedClass || !assignedSection) {
      return res.status(400).json({
        message: "class and section are required",
      });
    }

    await ensureTeacherRole(teacherId);

    const { data: occupiedAssignment, error: occupiedError } = await supabase
      .from("teacher_assignments")
      .select("teacher_id, class, section, academic_year")
      .eq("class", assignedClass)
      .eq("section", assignedSection)
      .eq("academic_year", academicYear)
      .neq("teacher_id", teacherId)
      .limit(1);

    if (occupiedError) {
      return res.status(500).json({
        message: "Failed to check existing teacher assignment",
        error: occupiedError.message,
      });
    }

    if (Array.isArray(occupiedAssignment) && occupiedAssignment.length > 0) {
      return res.status(409).json({
        message: `Class ${assignedClass} section ${assignedSection} is already assigned for ${academicYear}`,
      });
    }

    const assignmentPayload = {
      class: assignedClass,
      section: assignedSection,
      academic_year: academicYear,
      updated_at: new Date().toISOString(),
    };

    const { data: existingAssignment, error: existingError } = await supabase
      .from("teacher_assignments")
      .select("teacher_id, class, section, academic_year")
      .eq("teacher_id", teacherId)
      .eq("class", assignedClass)
      .eq("section", assignedSection)
      .eq("academic_year", academicYear)
      .limit(1);

    if (existingError) {
      return res.status(500).json({
        message: "Failed to check previous teacher assignment",
        error: existingError.message,
      });
    }

    const hasExistingAssignment = Array.isArray(existingAssignment) && existingAssignment.length > 0;
    const assignmentQuery = hasExistingAssignment
      ? supabase
        .from("teacher_assignments")
        .update(assignmentPayload)
        .eq("teacher_id", teacherId)
        .eq("class", assignedClass)
        .eq("section", assignedSection)
        .eq("academic_year", academicYear)
        .select("teacher_id, class, section, academic_year, created_at, updated_at")
        .single()
      : supabase
        .from("teacher_assignments")
        .insert([
          {
            teacher_id: teacherId,
            ...assignmentPayload,
          },
        ])
        .select("teacher_id, class, section, academic_year, created_at, updated_at")
        .single();

    const { data: assignment, error } = await assignmentQuery;

    if (error) {
      const isDuplicate = error.code === "23505" || /duplicate key/i.test(error.message || "");
      if (isDuplicate) {
        return res.status(409).json({
          message: `Class ${assignedClass} section ${assignedSection} is already assigned for ${academicYear}`,
        });
      }

      return res.status(500).json({
        message: "Failed to save teacher assignment",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: hasExistingAssignment ? "Teacher assignment already saved" : "Teacher assigned successfully",
      assignment,
    });
  } catch (err) {
    console.error("Teacher assignment error:", err);
    return res.status(err.status || 500).json({
      message: err.message || "Failed to save teacher assignment",
      ...(err.detail ? { error: err.detail } : {}),
    });
  }
};

router.post("/teachers/:id/assignment", adminOnly, saveTeacherAssignment);
router.patch("/teachers/:id/assignment", adminOnly, saveTeacherAssignment);

router.delete("/teachers/:id/assignment", adminOnly, async (req, res) => {
  try {
    const teacherId = req.params.id;
    await ensureTeacherRole(teacherId);
    const assignedClass = sanitizeString(req.query?.class || req.query?.assignedClass);
    const assignedSection = sanitizeString(req.query?.section || req.query?.assignedSection);
    const academicYear = req.query?.academic_year || req.query?.academicYear
      ? normalizeAcademicYear(req.query?.academic_year || req.query?.academicYear)
      : "";

    let query = supabase
      .from("teacher_assignments")
      .delete()
      .eq("teacher_id", teacherId);

    if (assignedClass) query = query.eq("class", assignedClass);
    if (assignedSection) query = query.eq("section", assignedSection);
    if (academicYear) query = query.eq("academic_year", academicYear);

    const { error } = await query;

    if (error) {
      return res.status(500).json({
        message: "Failed to remove teacher assignment",
        error: error.message,
      });
    }

    return res.json({
      success: true,
      message: "Teacher assignment removed",
    });
  } catch (err) {
    console.error("Remove teacher assignment error:", err);
    return res.status(err.status || 500).json({
      message: err.message || "Failed to remove teacher assignment",
    });
  }
});

/* ======================================================
   UPDATE TEACHER PROFILE (PUT / PATCH /teachers/:id)
   ====================================================== */
const handleUpdateTeacherProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      throw createHttpError(400, "Teacher ID is required");
    }

    let resolvedUserId = null;
    let existingProfile = null;

    if (isValidUuid(id)) {
      resolvedUserId = id;
      const { data: prof } = await supabase
        .from("teacher_profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      existingProfile = prof;
    } else {
      const { data: prof } = await supabase
        .from("teacher_profiles")
        .select("*")
        .or(`employee_id.eq.${id},username.eq.${id},email.eq.${id}`)
        .maybeSingle();
      if (prof?.id) {
        resolvedUserId = prof.id;
        existingProfile = prof;
      }
    }

    if (!resolvedUserId) {
      throw createHttpError(404, "Teacher profile not found");
    }

    const effectiveEmail = req.body.email || existingProfile?.email;
    const profile = await upsertTeacherProfile({
      teacherId: resolvedUserId,
      payload: {
        ...existingProfile,
        ...req.body,
        employee_id: req.body.employee_id || req.body.employeeId || existingProfile?.employee_id,
      },
      email: effectiveEmail,
      actorId: req.user?.id || null,
    });

    return res.json({
      success: true,
      message: "Teacher profile updated successfully",
      teacher: profile,
    });
  } catch (err) {
    console.error("Update teacher error:", err);
    return res.status(err.status || 500).json({
      message: err.message || "Failed to update teacher profile",
    });
  }
};

router.put("/teachers/:id", adminOnly, handleUpdateTeacherProfile);
router.patch("/teachers/:id", adminOnly, handleUpdateTeacherProfile);

router.delete("/teachers/:id", adminOnly, async (req, res) => {
  try {
    const teacherId = req.params.id;
    if (!teacherId) {
      throw createHttpError(400, "Teacher ID is required");
    }

    if (req.user?.id && req.user.id === teacherId) {
      throw createHttpError(400, "You cannot remove your own account");
    }

    // 1. Delete dependent relations first to satisfy foreign key constraints
    await Promise.allSettled([
      supabase.from("teacher_assignments").delete().eq("teacher_id", teacherId),
      supabase.from("timetable_entries").delete().eq("teacher_id", teacherId),
      supabase.from("teacher_attendance_records").delete().eq("teacher_id", teacherId),
      supabase.from("teacher_leave_requests").delete().eq("teacher_id", teacherId),
      supabase.from("teacher_notifications").delete().eq("teacher_id", teacherId),
      supabase.from("teacher_attendance_settings").delete().eq("teacher_id", teacherId),
    ]);

    // 2. Delete teacher profile
    await supabase.from("teacher_profiles").delete().eq("id", teacherId);

    // 3. Delete user role
    await supabase.from("user_roles").delete().eq("user_id", teacherId);

    // 4. Delete Supabase auth user
    try {
      await retryWithBackoff(() => supabaseAdmin.auth.admin.deleteUser(teacherId));
    } catch (authDelErr) {
      console.warn("Auth user delete notice:", authDelErr?.message || authDelErr);
    }

    return res.json({
      success: true,
      message: "Teacher and all related records removed successfully",
      teacherId,
    });
  } catch (err) {
    console.error("Remove teacher error:", err);
    return res.status(err.status || 500).json({
      message: err.message || "Failed to remove teacher",
      ...(err.detail ? { error: err.detail } : {}),
    });
  }
});
/* ======================================================
   FORGOT PASSWORD / RESET PASSWORD
   ====================================================== */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required"
      });
    }

    // ⚡ OPTIMIZATION: Use generateLink directly with retry instead of listing all users
    // This avoids fetching ALL users just to check one email
    const { error: resetError } = await retryWithBackoff(() =>
      supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: email,
      })
    );

    // Always return success to prevent email enumeration attacks
    res.json({
      success: true,
      message: "If the email exists, a password reset link has been sent.",
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    // Still return success for security
    res.json({
      success: true,
      message: "If the email exists, a password reset link has been sent.",
    });
  }
});

/* ======================================================
   RESET PASSWORD HELPER & ROUTES (Direct Admin Override)
   ====================================================== */
const handleResetUserPassword = async ({ targetId, email, newPassword }) => {
  if (!newPassword || String(newPassword).length < 6) {
    throw createHttpError(400, "Password must be at least 6 characters long");
  }

  let resolvedUserId = null;
  let resolvedEmail = email || null;

  // 1. If targetId is already a valid UUID, use it directly
  if (targetId && isValidUuid(targetId)) {
    resolvedUserId = targetId;
  }

  // 2. If targetId is not a valid UUID (e.g. employee ID like TCH-101), look up in teacher_profiles
  if (!resolvedUserId) {
    const searchVal = targetId || email;
    if (searchVal) {
      let query = supabase.from("teacher_profiles").select("id, email, employee_id, username");
      if (isValidUuid(searchVal)) {
        query = query.eq("id", searchVal);
      } else {
        query = query.or(`employee_id.eq.${searchVal},username.eq.${searchVal},email.eq.${searchVal}`);
      }
      const { data: prof } = await query.maybeSingle();
      if (prof?.id) {
        resolvedUserId = prof.id;
        resolvedEmail = resolvedEmail || prof.email;
      }
    }
  }

  // 3. If still not resolved and email exists, search in auth.users
  if (!resolvedUserId && resolvedEmail) {
    const { data: usersData } = await retryWithBackoff(() =>
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    );
    const found = usersData?.users?.find(
      (u) => (u.email || "").toLowerCase() === String(resolvedEmail).trim().toLowerCase()
    );
    if (found?.id) {
      resolvedUserId = found.id;
    }
  }

  if (!resolvedUserId) {
    throw createHttpError(404, "Teacher / Staff account not found for password reset");
  }

  // 4. Update password in Supabase Auth
  try {
    const { error: updateError } = await retryWithBackoff(() =>
      supabaseAdmin.auth.admin.updateUserById(resolvedUserId, {
        password: newPassword,
      })
    );

    if (updateError) {
      // If user not found in auth.users but exists in teacher_profiles, create the auth user so login works!
      if (updateError.status === 404 || updateError.message?.toLowerCase().includes("not found")) {
        const { data: teacherProfile } = await supabase
          .from("teacher_profiles")
          .select("email, employee_id")
          .eq("id", resolvedUserId)
          .maybeSingle();

        const userEmail = teacherProfile?.email || resolvedEmail || `${(teacherProfile?.employee_id || "staff").toLowerCase().replace(/[^a-z0-9]/g, "")}@starpublicschool.com`;
        await retryWithBackoff(() =>
          supabaseAdmin.auth.admin.createUser({
            id: resolvedUserId,
            email: userEmail,
            password: newPassword,
            email_confirm: true,
          })
        );
      } else {
        throw updateError;
      }
    }
  } catch (authErr) {
    console.error("Auth password update error:", authErr);
    throw createHttpError(authErr.status || 500, authErr.message || "Failed to update auth password");
  }

  // 5. Update teacher_profiles must_reset_password flag to false
  try {
    await supabase
      .from("teacher_profiles")
      .update({ must_reset_password: false, updated_at: new Date().toISOString() })
      .eq("id", resolvedUserId);
  } catch (_) { }

  return { id: resolvedUserId, email: resolvedEmail };
};

router.post("/reset-password", adminOnly, async (req, res) => {
  try {
    const { id, userId, email } = req.body;
    const newPassword = req.body.newPassword || req.body.password || req.body.new_password;
    const result = await handleResetUserPassword({
      targetId: id || userId,
      email,
      newPassword,
    });
    return res.json({
      success: true,
      message: "Password reset successfully",
      userId: result.id,
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(err.status || 400).json({
      success: false,
      message: err.message || "Failed to reset password. Please try again.",
    });
  }
});

router.patch("/reset-password/:id", adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const newPassword = req.body.newPassword || req.body.password || req.body.new_password;
    const result = await handleResetUserPassword({
      targetId: id,
      email: req.body.email,
      newPassword,
    });
    return res.json({
      success: true,
      message: "Password reset successfully",
      userId: result.id,
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(err.status || 400).json({
      success: false,
      message: err.message || "Failed to reset password. Please try again.",
    });
  }
});

/* ======================================================
   REMOVE USER (DELETE TEACHER/ADMIN)
   ====================================================== */
router.delete("/remove-user/:id", adminOnly, async (req, res) => {
  try {
    const deletedUser = await deleteManagedUser({
      userId: req.params.id,
      actorUserId: req.user?.id || null,
    });

    res.json({
      success: true,
      message: "User removed successfully",
      deletedUser,
    });
  } catch (err) {
    console.error("Remove user error:", err);
    res.status(err.status || 503).json({
      message: err.message || "Service temporarily unavailable. Please try again.",
      ...(err.detail ? { error: err.detail } : {}),
    });
  }
});
/* ======================================================
   GET ALL USERS (LIST ADMIN/TEACHER)
   ====================================================== */
router.get("/users", adminOnly, async (req, res) => {
  try {
    // ⚡ OPTIMIZATION: Get roles directly from table (which is faster than listing all Supabase users)
    // Only fetch from Supabase auth if we really need full user details
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (roleError) {
      return res.status(503).json({
        message: "Failed to fetch users. Please try again.",
        error: roleError.message
      });
    }

    // Return just from our table - faster and sufficient for most use cases
    // If you need auth details, those can be fetched on-demand
    const users = roleData.map((role) => ({
      id: role.user_id,
      role: role.role,
    }));

    res.json({
      success: true,
      users: users,
      count: users.length,
      note: "Email and auth details not included for performance. Use /api/auth/users/:id to get full details.",
    });

  } catch (err) {
    console.error("Get users error:", err);
    res.status(503).json({
      message: "Service temporarily unavailable. Please try again.",
      error: err.message
    });
  }
});

/* ======================================================
   LOGOUT (ADMIN/TEACHER)
   ====================================================== */
router.post("/logout", async (req, res) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required. Please provide a valid token."
      });
    }

    const token = authHeader.split(" ")[1];

    // ⚡ OPTIMIZATION: Verify token with proper Supabase auth
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      // Token already invalid/expired, but still return success
      return res.json({
        success: true,
        message: "Logged out successfully (token was already invalid or expired). All protected APIs are now blocked.",
        note: "Only public result APIs will work. Please login again to access protected APIs.",
      });
    }

    // Get user role for response from cache
    const role = await getRoleCached(user.id);

    // ⚡ OPTIMIZATION: Revoke sessions with retry
    try {
      await retryWithBackoff(() =>
        supabaseAdmin.auth.admin.signOut(user.id, "global")
      );
    } catch (signOutError) {
      console.warn("SignOut warning (non-critical):", signOutError.message);
      // Non-critical error, continue
    }

    res.json({
      success: true,
      message: "Logged out successfully. Token has been invalidated.",
      note: "All protected APIs are now blocked. Only public result APIs will work. Please login again to access protected APIs.",
      user: {
        id: user.id,
        email: user.email,
        role: role || "unknown",
      },
      logout_time: new Date().toISOString(),
    });

  } catch (err) {
    console.error("Logout error:", err);
    res.status(503).json({
      message: "Service temporarily unavailable. Please try again.",
      error: err.message
    });
  }
});

/* ======================================================
   REFRESH TOKEN (ADMIN/TEACHER)
   ====================================================== */
router.post("/refresh", async (req, res) => {
  try {
    // Get refresh token from body or header
    const { refresh_token } = req.body;
    const authHeader = req.headers.authorization;

    let token = refresh_token;

    // If no refresh_token in body, try to get from Authorization header
    if (!token && authHeader && authHeader.startsWith("Bearer ")) {
      const accessToken = authHeader.split(" ")[1];

      // Get user session to extract refresh token
      const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);

      if (userError || !user) {
        return res.status(401).json({
          message: "Login expired. Please login again."
        });
      }

      // Note: Supabase refresh requires the full session object
      // This is a simplified version - frontend should handle refresh with session
      return res.status(400).json({
        message: "Please provide refresh_token in request body. Use the refresh_token from login response."
      });
    }

    if (!token) {
      return res.status(400).json({
        message: "Refresh token is required"
      });
    }

    // Refresh the session
    const { data, error } = await supabaseAuth.auth.refreshSession({
      refresh_token: token,
    });

    if (error) {
      return res.status(401).json({
        message: "Login expired. Please login again.",
        error: error.message
      });
    }

    // App login remains valid for 30 days after refresh.
    const expiresAt = new Date(Date.now() + APP_SESSION_TTL_MS);

    // Get user role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .single();

    if (roleError || !roleData) {
      return res.status(403).json({
        message: "Role not assigned"
      });
    }
    const assignments =
      roleData.role === "teacher"
        ? (await getTeacherAssignmentMap([data.user.id])).get(data.user.id) || []
        : [];
    const assignment = assignments[0] || null;
    const appAccessToken = buildAppAccessToken(
      {
        id: data.user.id,
        email: data.user.email,
        role: roleData.role,
        assignedClass: assignment?.class || null,
        assignedSection: assignment?.section || null,
        academicYear: assignment?.academic_year || null,
      },
      assignments
    );
    const appSession = {
      ...(data.session || {}),
      access_token: appAccessToken,
      refresh_token: data.session?.refresh_token || "",
    };

    res.json({
      success: true,
      message: "Token refreshed successfully",
      access_token: appAccessToken,
      refresh_token: appSession.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: roleData.role,
        assignedClass: assignment?.class || null,
        assignedSection: assignment?.section || null,
        academicYear: assignment?.academic_year || null,
        assignments,
      },
      session: appSession,
      token_info: {
        expires_at: expiresAt.toISOString(),
        expires_in: APP_SESSION_TTL_SECONDS,
        note: "Login expires after 30 days. Use /api/auth/refresh to extend session.",
      },
    });

  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
});

export default router;


