import express from "express";
import {
  getSettings,
  saveSettings,
  getPeriods,
  savePeriod,
  deletePeriod,
  getTimetableEntries,
  saveTimetableEntry,
  deleteTimetableEntry,
  copyDaySchedule,
  copyWeekSchedule,
  togglePublishTimetable,
  getConflictReport,
  getTeacherTimetable,
  getClassTimetable,
  getTeacherWorkloadReport,
  getUnassignedPeriodsReport,
  getSubstitutions,
  getAvailableSubstitutes,
  assignSubstitution,
  deleteSubstitution,
  replaceFacultyInRoutine,
} from "../controllers/timetable.controller.js";
import {
  adminOnly,
  adminOrTeacher,
  adminTeacherOrStudent,
} from "../middleware/auth.middleware.js";

const router = express.Router();

/* 1. School Timings & Periods Configuration */
router.get("/settings", adminOrTeacher, getSettings);
router.post("/settings", adminOnly, saveSettings);
router.get("/periods", adminTeacherOrStudent, getPeriods);
router.post("/periods", adminOnly, savePeriod);
router.put("/periods/:id", adminOnly, savePeriod);
router.delete("/periods/:id", adminOnly, deletePeriod);

/* 2. Timetable Entries CRUD & Batch Operations */
router.get("/entries", adminTeacherOrStudent, getTimetableEntries);
router.post("/entries", adminOnly, saveTimetableEntry);
router.put("/entries/:id", adminOnly, saveTimetableEntry);
router.delete("/entries/:id", adminOnly, deleteTimetableEntry);

router.post("/copy-day", adminOnly, copyDaySchedule);
router.post("/copy-week", adminOnly, copyWeekSchedule);
router.post("/publish", adminOnly, togglePublishTimetable);

/* 3. Conflict Detection & Reports */
router.get("/conflicts", adminOrTeacher, getConflictReport);
router.get("/reports/workload", adminOrTeacher, getTeacherWorkloadReport);
router.get("/reports/unassigned", adminOrTeacher, getUnassignedPeriodsReport);

/* 4. Teacher-wise & Class-wise Timetables */
router.get("/my-timetable", adminOrTeacher, (req, res, next) => {
  req.params.teacherId = req.user?.id;
  getTeacherTimetable(req, res, next);
});
router.get("/teacher/:teacherId", adminOrTeacher, getTeacherTimetable);
router.get("/class/:className", adminTeacherOrStudent, getClassTimetable);

/* 5. Daily Substitution & Proxy Management (For absent faculty) */
router.get("/substitutions", adminTeacherOrStudent, getSubstitutions);
router.get("/available-substitutes", adminOrTeacher, getAvailableSubstitutes);
router.post("/substitutions", adminOnly, assignSubstitution);
router.delete("/substitutions/:id", adminOnly, deleteSubstitution);

/* 6. Permanent Faculty Replacement (When teacher leaves or joins) */
router.post("/replace-faculty", adminOnly, replaceFacultyInRoutine);

export default router;
