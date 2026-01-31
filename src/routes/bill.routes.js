import express from "express";
import {
  generateBillsPDFController,
  generateBillsForClass,
  generateBillsForAll,
} from "../controllers/bill.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * GET /api/bills/pdf?month=YYYY-MM
 * Generate PDF with all bills for a given month (4 bills per page)
 * Admin Only
 */
router.get("/pdf", adminOnly, generateBillsPDFController);

/**
 * POST /api/bills/generate
 * Generate bills for all students in a class for a given month
 * Body: { class: "Class Name", month: "YYYY-MM" }
 * Admin Only
 */
router.post("/generate", adminOnly, generateBillsForClass);

/**
 * POST /api/bills/generate-all
 * Generate bills for all students in all classes for a given month
 * Body: { month: "YYYY-MM" }
 * Admin Only
 */
router.post("/generate-all", adminOnly, generateBillsForAll);

export default router;

