import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase, getAppJwtSecret } from "../services/supabase.js";
import { authenticate, authorize } from "../middleware/auth.middleware.js";

const router = express.Router();

const studentSelect = "*";
const STUDENT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const STUDENT_SESSION_TTL_MS = STUDENT_SESSION_TTL_SECONDS * 1000;

const isActiveStudentQuery = (query) => query.eq("status", "active");

const normalizeCredential = (value) => String(value || "").trim();

const normalizeDateOnly = (value) => {
  const input = normalizeCredential(value);
  if (!input) return "";

  // 1. Check DD-MM-YYYY or DD/MM/YYYY
  const dmy = input.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    const y = dmy[3];
    return `${y}-${m}-${d}`;
  }

  // 2. Check YYYY-MM-DD or YYYY/MM/DD
  const ymd = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, "0");
    const d = ymd[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().split("T")[0];
};

const isDateCredential = (value) => Boolean(normalizeDateOnly(value));

const checkDefaultPasswordMatch = (student, credential) => {
  if (!student || !credential) return false;
  const rawInput = String(credential).trim();
  const lowerInput = rawInput.toLowerCase();

  const studentDob = normalizeDateOnly(student.date_of_birth);
  const birthYear = studentDob ? studentDob.split("-")[0] : "";

  // 1. Direct DOB match (e.g. "2010-01-01", "01-01-2010", "01/01/2010")
  const normalizedInputDob = normalizeDateOnly(rawInput);
  if (studentDob && normalizedInputDob && normalizedInputDob === studentDob) {
    return true;
  }

  if (birthYear) {
    const rawName = String(student.name || "").trim();
    const lettersOnly = rawName.replace(/[^a-zA-Z]/g, "");
    const firstWordLetters = (rawName.split(/\s+/)[0] || "").replace(/[^a-zA-Z]/g, "");

    // 2. Name starting 4 letters + birth year (e.g. "Tanf2010", "Stud2010")
    if (lettersOnly.length >= 2) {
      const fourLettersYear = `${lettersOnly.slice(0, 4).toLowerCase()}${birthYear}`;
      if (lowerInput === fourLettersYear) return true;
    }

    // 3. Full first name + birth year (e.g. "Tanfeez2010", "Student2010")
    if (firstWordLetters) {
      const firstNameYear = `${firstWordLetters.toLowerCase()}${birthYear}`;
      if (lowerInput === firstNameYear) return true;
    }

    // 4. Clean name (full letters) + birth year
    if (lettersOnly) {
      const fullLettersYear = `${lettersOnly.toLowerCase()}${birthYear}`;
      if (lowerInput === fullLettersYear) return true;
    }

    // 5. Username + birth year
    if (student.username) {
      const usernameYear = `${String(student.username).toLowerCase()}${birthYear}`;
      if (lowerInput === usernameYear) return true;
    }
  }

  return false;
};

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

    const cleanUsername = String(username).trim();
    const { data: student, error: studentError } = await isActiveStudentQuery(
      supabase
        .from("students")
        .select(studentSelect)
        .ilike("username", cleanUsername)
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
      .eq("student_id", student.id)
      .eq("is_active", true)
      .maybeSingle();

    if (authError) {
      return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }

    let authRecord = authRow || null;
    let firstLogin = false;
    let mustResetPassword = false;

    const isDefaultMatch = checkDefaultPasswordMatch(student, loginCredential);

    if (!authRecord) {
      if (!isDefaultMatch) {
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
      let credentialMatchesHash = await bcrypt.compare(loginCredential, authRecord.password_hash || "");

      // If direct hash comparison fails, check if student is logging in with default Name+Year or DOB
      if (!credentialMatchesHash && isDefaultMatch) {
        credentialMatchesHash = true;
        mustResetPassword = true;
      }

      if (!credentialMatchesHash) {
        return res.status(401).json({ success: false, message: "Invalid username or password." });
      }

      mustResetPassword = mustResetPassword || isDefaultMatch || (await bcrypt.compare(studentDob, authRecord.password_hash || ""));
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

    const expiresAt = new Date(Date.now() + STUDENT_SESSION_TTL_MS);
    const accessToken = jwt.sign(user, jwtSecret, { expiresIn: STUDENT_SESSION_TTL_SECONDS });

    return res.json({
      success: true,
      user,
      access_token: accessToken,
      token_info: {
        expires_at: expiresAt.toISOString(),
        expires_in: STUDENT_SESSION_TTL_SECONDS,
        note: "Login expires after 30 days.",
      },
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
