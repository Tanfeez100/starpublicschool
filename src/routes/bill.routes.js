import express from "express";
import {
  getBillsDownloadData,
  generateBillsForClass,
  
} from "../controllers/bill.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * GET /api/bills/download-data?month=YYYY-MM&class=LKG
 * Returns structured bill data for PDF generation (Frontend handles PDF)
 * Admin Only
 */
router.get("/download-data", adminOnly, getBillsDownloadData);

/**
 * POST /api/bills/generate
 * Generate bills for a specific class
 */
router.post("/generate", adminOnly, generateBillsForClass);

/**
 * POST /api/bills/generate-all
 * Generate bills for all students
 */

export default router;
