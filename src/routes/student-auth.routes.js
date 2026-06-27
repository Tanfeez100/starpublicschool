import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase, getAppJwtSecret } from "../services/supabase.js";

const router = express.Router();

const studentSelect = "id, name, class, section, roll_no, academic_year, status";

const isActiveStudentQuery = (query) => query.eq("status", "active");

const studentPayload = (student) => ({
  id: student.id,
  role: "student",
  name: student.name || "",
  class: student.class || "",
  section: student.section || "",
  rollNo: student.roll_no || "",
  academicYear: student.academic_year || "",
});

router.post("/signup", async (req, res) => {
  try {
    const { student_id: studentId, username, password } = req.body || {};

    if (!studentId || !username || !password) {
      return res.status(400).json({ success: false, message: "student_id, username and password are required" });
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
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "username and password are required" });
    }

    const { data: authRow, error: authError } = await supabase
      .from("student_auth")
      .select("student_id, username, password_hash, is_active")
      .eq("username", String(username).trim())
      .eq("is_active", true)
      .maybeSingle();

    if (authError || !authRow) {
      return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

    const passwordOk = await bcrypt.compare(String(password), authRow.password_hash || "");
    if (!passwordOk) {
      return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

    const { data: student, error: studentError } = await isActiveStudentQuery(
      supabase.from("students").select(studentSelect).eq("id", authRow.student_id)
    ).single();

    if (studentError || !student) {
      return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

    await supabase
      .from("student_auth")
      .update({ last_login_at: new Date().toISOString() })
      .eq("student_id", authRow.student_id);

    const user = studentPayload(student);
    const jwtSecret = getAppJwtSecret();
    if (!jwtSecret) {
      return res.status(500).json({ success: false, message: "Student login is not configured." });
    }

    const accessToken = jwt.sign(user, jwtSecret, { expiresIn: "8h" });

    return res.json({
      success: true,
      user,
      access_token: accessToken,
    });
  } catch (error) {
    console.error("Student login error:", error);
    return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
  }
});

export default router;
