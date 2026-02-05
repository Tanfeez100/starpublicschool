import express from "express";
import { downloadInvoice } from "../controllers/invoice.controller.js";
import { adminOrTeacher } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * GET /api/invoice/download/:bill_id
 * Download invoice as professional PDF
 * Admin or Teacher
 */
router.get("/download/:bill_id", adminOrTeacher, downloadInvoice);

export default router;

