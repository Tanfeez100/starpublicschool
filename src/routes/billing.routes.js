import express from "express";
import {
  generateBulkBills,
  getBill,
  downloadBills,
} from "../controllers/billing.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * POST /api/billing/generate-bulk
 * Generate bulk bills with checkbox options
 * Admin Only
 * Body: {
 *   class, section?, month,
 *   includeAnnualFee?, includeExamFee?, includeComputerFee?
 * }
 */
router.post("/generate-bulk", generateBulkBills);

/**
 * GET /api/billing/bill/:id
 * Get a single bill by ID
 * Admin Only
 */
router.get("/bill/:id", adminOnly, getBill);

/**
 * GET /api/billing/download?class=&month=&section=
 * Download bills as PDF
 * Admin Only
 */
router.get("/download", adminOnly, downloadBills);

export default router;

