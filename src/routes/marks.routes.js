import express from "express";
import {
  getResultByClassRoll,
  submitMarks,
  publishResult,
  getMarks,
  getCachedResultPdfController,
  saveCachedResultPdfController,
  bulkImportClassMarksController,
} from "../controllers/marks.controller.js";
import { adminOrTeacher, adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

/* GET MARKS - Get all students' marks for a class and section */
router.get("/", adminOrTeacher, getMarks);

/* TEACHER - Submit Marks - Admin & Teacher can access */
router.post("/submit", adminOrTeacher, submitMarks);

/* STUDENT / RESULT - PUBLIC (No middleware) - Students can view their result */
router.get("/result", getResultByClassRoll);

/* CACHED RESULT PDF - PUBLIC - Get or Save on-demand cached PDF */
router.get("/result/cached-pdf", getCachedResultPdfController);
router.post("/result/cached-pdf", saveCachedResultPdfController);

/* PUBLISH RESULT - Admin Only */
router.post("/publish", adminOnly, publishResult);

/* FAST-TRACK BULK IMPORT - Admin & Teacher */
router.post("/bulk-import-class", adminOrTeacher, bulkImportClassMarksController);

export default router;
