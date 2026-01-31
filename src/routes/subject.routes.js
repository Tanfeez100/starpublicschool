import express from "express";
import {
  createSubject,
  getAllSubjects,
  getClassSubjects,
  addSubjectToClass,
  removeSubjectFromClass,
  updateSubjectSequence,
  addMultipleSubjectsToClass,
  deleteSubject,
} from "../controllers/subject.controller.js";
import { adminOnly, adminOrTeacher } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * POST /api/subjects
 * Create a new subject (only name and code)
 * Body: { name: "Hindi", code: "HND" }
 * Access: Admin Only
 */
router.post("/", adminOnly, createSubject);

/**
 * DELETE /api/subjects/:id
 * OR DELETE /api/subjects?subject_name=Hindi
 * OR DELETE /api/subjects?subject_code=HND
 * Delete a subject from the master subjects table
 * This will cascade delete from class_subjects and marks tables
 * Access: Admin Only
 */
router.delete("/:id", adminOnly, deleteSubject);
router.delete("/", adminOnly, deleteSubject);

/**
 * GET /api/subjects
 * Get all available subjects (Master list)
 * Returns only id, name, code (no marks)
 * Access: Admin & Teacher
 */
router.get("/", adminOrTeacher, getAllSubjects);

/**
 * GET /api/subjects/class/:class?section=A
 * Get subjects for a specific class
 * Access: Admin & Teacher
 */
router.get("/class/:class", adminOrTeacher, getClassSubjects);

/**
 * POST /api/subjects/add
 * Add an existing subject to a class and section
 * Body: { class: "1", subject_name: "Hindi" OR subject_code: "HND", section: "A", sequence: 1 (optional) }
 * Subject must already exist in subjects table (created via POST /api/subjects)
 * Access: Admin Only
 */
router.post("/add", adminOnly, addSubjectToClass);

/**
 * POST /api/subjects/add-multiple
 * Add multiple subjects to a class at once
 * Body: { class: "1", section: "A", subjects: [{ subject_id: "uuid" }] }
 * Class and section are mandatory
 * Access: Admin Only
 */
router.post("/add-multiple", adminOnly, addMultipleSubjectsToClass);

/**
 * DELETE /api/subjects/remove/:id
 * Remove subject from class by class_subjects id
 * Access: Admin Only
 */
router.delete("/remove/:id", adminOnly, removeSubjectFromClass);

/**
 * DELETE /api/subjects/remove?class=1&section=A&subject_name=Hindi
 * OR DELETE /api/subjects/remove?class=1&section=A&subject_code=HND
 * Remove subject from class and section by class, section, and subject name/code
 * Access: Admin Only
 */
router.delete("/remove", adminOnly, removeSubjectFromClass);

/**
 * PUT /api/subjects/sequence/:id
 * Update subject sequence in a class
 * Body: { sequence: 2 }
 * Access: Admin Only
 */
router.put("/sequence/:id", adminOnly, updateSubjectSequence);

export default router;

