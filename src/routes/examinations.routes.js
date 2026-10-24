import express from "express";
import {
  getExaminationOverview,
  getExaminations,
  createExamination,
  updateExamination,
  deleteExamination,
  archiveExamination,
  getTimetables,
  createTimetableEntry,
  updateTimetableEntry,
  deleteTimetableEntry,
  copyTimetable,
  togglePublishTimetable,
  getExaminationSubjects,
  saveExaminationSubject,
  getMarksSheet,
  batchSaveMarks,
  approveMarks,
  calculateAndGetResults,
  togglePublishResults,
  getNotices,
  createNotice,
  updateNotice,
  deleteNotice,
  getExaminationReports,
} from "../controllers/examinations.controller.js";
import { adminOnly, adminOrTeacher, adminTeacherOrStudent } from "../middleware/auth.middleware.js";

const router = express.Router();

/* 1. Overview */
router.get("/overview", adminTeacherOrStudent, getExaminationOverview);

/* 2. Exam Setup CRUD */
router.get("/", adminTeacherOrStudent, getExaminations);
router.post("/", adminOnly, createExamination);
router.put("/:id", adminOnly, updateExamination);
router.delete("/:id", adminOnly, deleteExamination);
router.post("/:id/archive", adminOnly, archiveExamination);

/* 3. Timetables */
router.get("/:examId/timetables", adminTeacherOrStudent, getTimetables);
router.post("/:examId/timetables", adminOnly, createTimetableEntry);
router.put("/:examId/timetables/:timetableId", adminOnly, updateTimetableEntry);
router.delete("/:examId/timetables/:timetableId", adminOnly, deleteTimetableEntry);
router.post("/:examId/timetables/copy", adminOnly, copyTimetable);
router.post("/:examId/timetables/publish", adminOnly, togglePublishTimetable);

/* 4. Subjects & Components */
router.get("/:examId/subjects", adminOrTeacher, getExaminationSubjects);
router.post("/:examId/subjects", adminOnly, saveExaminationSubject);

/* 5. Marks Entry & Approval */
router.get("/:examId/marks", adminOrTeacher, getMarksSheet);
router.post("/:examId/marks/batch", adminOrTeacher, batchSaveMarks);
router.post("/:examId/marks/approve", adminOnly, approveMarks);

/* 6. Results & Publication */
router.get("/:examId/results", adminTeacherOrStudent, calculateAndGetResults);
router.post("/:examId/results/publish", adminOnly, togglePublishResults);

/* 7. Notices & Announcements */
router.get("/notices/list", adminTeacherOrStudent, getNotices);
router.post("/notices", adminOnly, createNotice);
router.put("/notices/:noticeId", adminOnly, updateNotice);
router.delete("/notices/:noticeId", adminOnly, deleteNotice);

/* 8. Reports */
router.get("/:examId/reports", adminOrTeacher, getExaminationReports);

export default router;
