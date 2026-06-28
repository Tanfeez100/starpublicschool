import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase, getAppJwtSecret } from "../services/supabase.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

const studentSelect = "*";

const isActiveStudentQuery = (query) => query.eq("status", "active");

const normalizeCredential = (value) => String(value || "").trim();

const normalizeDateOnly = (value) => {
  const input = normalizeCredential(value);
  if (!input) return "";

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().split("T")[0];
};

const isDateCredential = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

const studentPayload = (student) => ({
  id: student.id,
  role: "student",
  name: student.name || "",
  fatherName: student.father_name || "",
  motherName: student.mother_name || "",
  gender: student.gender || "",
  class: student.class || "",
  section: student.section || "",
  rollNo: student.roll_no || "",
  academicYear: student.academic_year || "",
  status: student.status || "",
  mobile: student.mobile || "",
  address: student.address || "",
  usesTransport: Boolean(student.uses_transport),
  transportCharge: student.transport_charge ?? "",
  aadhaarCard: student.aadhaar_card || "",
  penNumber: student.pen_number || "",
  admissionNumber: student.admission_number || "",
  admissionDate: student.admission_date || "",
  photoUrl: student.photo_url || "",
  username: student.username || "",
  dateOfBirth: student.date_of_birth || "",
  mustResetPassword: Boolean(student.mustResetPassword),
});

const ensureStudentAuthRow = async (student, passwordHash) => {
  const { error } = await supabase.from("student_auth").upsert(
    [
      {
        student_id: student.id,
        username: student.username,
        password_hash: passwordHash,
        is_active: true,
      },
    ],
    { onConflict: "student_id" }
  );

  if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
    throw error;
  }
};

router.post("/signup", async (req, res) => {
  try {
    const { student_id: studentId, username, password } = req.body || {};

    if (!studentId || !username || !password) {
      return res.status(400).json({
        success: false,
        message: "student_id, username and password are required",
      });
    }

    const { data: student, error: studentError } = await isActiveStudentQuery(
      supabase.from("students").select("id").eq("id", studentId)
    ).single();

    if (studentError || !student) {
      return res.status(404).json({ success: false, message: "Student not found or inactive" });
    }

    const { data: existing } = await supabase
      .from("student_auth")
      .select("student_id")
      .eq("username", String(username).trim())
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ success: false, message: "Username already taken" });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const { error: insertError } = await supabase.from("student_auth").insert([
      {
        student_id: studentId,
        username: String(username).trim(),
        password_hash: passwordHash,
      },
    ]);

    if (insertError) {
      console.error("Student signup insert error:", insertError);
      return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }

    return res.status(201).json({ success: true, message: "Account created." });
  } catch (error) {
    console.error("Student signup error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password, credential, dob, date_of_birth } = req.body || {};
    const loginCredential = normalizeCredential(credential || dob || date_of_birth || password);

    if (!username || !loginCredential) {
      return res.status(400).json({
        success: false,
        message: "username and DOB/password are required",
      });
    }

    const { data: student, error: studentError } = await isActiveStudentQuery(
      supabase
        .from("students")
        .select(studentSelect)
        .eq("username", String(username).trim())
    ).maybeSingle();

    if (studentError || !student) {
      return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

    const studentDob = normalizeDateOnly(student.date_of_birth);
    if (!studentDob) {
      return res.status(400).json({
        success: false,
        message: "Student date of birth missing. Admin se DOB update karwayein.",
      });
    }

    const { data: authRow, error: authError } = await supabase
      .from("student_auth")
      .select("student_id, username, password_hash, is_active")
      .eq("username", String(username).trim())
      .eq("is_active", true)
      .maybeSingle();

    if (authError) {
      return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }

    let authRecord = authRow || null;
    let firstLogin = false;
    let mustResetPassword = false;

    if (!authRecord) {
      if (!isDateCredential(loginCredential) || loginCredential !== studentDob) {
        return res.status(401).json({ success: false, message: "Invalid username or password." });
      }

      const tempPasswordHash = await bcrypt.hash(loginCredential, 12);
      await ensureStudentAuthRow(student, tempPasswordHash);
      authRecord = {
        student_id: student.id,
        username: student.username,
        password_hash: tempPasswordHash,
        is_active: true,
      };
      firstLogin = true;
      mustResetPassword = true;
    } else {
      const credentialMatchesHash = await bcrypt.compare(loginCredential, authRecord.password_hash || "");
      if (!credentialMatchesHash) {
        return res.status(401).json({ success: false, message: "Invalid username or password." });
      }
      mustResetPassword = await bcrypt.compare(studentDob, authRecord.password_hash || "");
    }

    const { error: loginUpdateError } = await supabase
      .from("student_auth")
      .update({ last_login_at: new Date().toISOString() })
      .eq("student_id", student.id);

    if (loginUpdateError) {
      console.warn("Student login timestamp update failed:", loginUpdateError.message);
    }

    const user = studentPayload({
      ...student,
      mustResetPassword,
    });
    const jwtSecret = getAppJwtSecret();
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: "Student login is not configured." });
    }

    const accessToken = jwt.sign(user, jwtSecret, { expiresIn: "8h" });

    return res.json({
      success: true,
      user,
      access_token: accessToken,
      must_reset_password: user.mustResetPassword,
      first_login: firstLogin,
    });
  } catch (error) {
    console.error("Student login error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

router.post("/set-password", authenticate, authorize("student"), async (req, res) => {
  try {
    const { password, new_password, confirm_password } = req.body || {};
    const nextPassword = normalizeCredential(new_password || password);

    if (!nextPassword) {
      return res.status(400).json({ success: false, message: "New password is required." });
    }

    if (nextPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters." });
    }

    if (confirm_password !== undefined && nextPassword !== normalizeCredential(confirm_password)) {
      return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select(studentSelect)
      .eq("id", req.user.id)
      .maybeSingle();

    if (studentError || !student) {
      return res.status(404).json({ success: false, message: "Student not found." });
    }

    const passwordHash = await bcrypt.hash(nextPassword, 12);
    const payload = {
      student_id: req.user.id,
      username: student.username,
      password_hash: passwordHash,
      is_active: true,
    };

    const { error: deleteError } = await supabase.from("student_auth").delete().eq("student_id", req.user.id);
    if (deleteError) {
      return res.status(500).json({ success: false, message: deleteError.message });
    }

    const { error: insertError } = await supabase.from("student_auth").insert([payload]);
    if (insertError) {
      return res.status(500).json({ success: false, message: insertError.message });
    }

    const user = studentPayload({
      ...student,
      mustResetPassword: false,
    });

    return res.json({
      success: true,
      message: "Password set successfully.",
      user,
    });
  } catch (error) {
    console.error("Student set password error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

export default router;
