import express from "express";
import {
  closeMonth,
  getMonthClosureStatus,
  getStudentDues,
  getFeeList,
  payFee,
  getInvoice,
} from "../controllers/fees.controller.js";
import {
  getAutoCloseCronStatus,
  runAutoMonthCloseJob,
} from "../services/autoMonthClose.cron.js";
import { adminOnly, adminOrTeacher } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * GET /api/fees/closure-status?month=YYYY-MM
 * Check if a month is closed and view auto-close schedule info
 * Admin or Teacher
 */
router.get("/closure-status", adminOrTeacher, getMonthClosureStatus);

/**
 * GET /api/fees/cron-status
 * Check auto-close cron scheduler status and schedule metadata
 * Admin or Teacher
 */
router.get("/cron-status", adminOrTeacher, (req, res) => {
  res.json({ success: true, ...getAutoCloseCronStatus() });
});

/**
 * POST /api/fees/cron-trigger
 * Test-trigger the auto-close month job (Optional force flag in body: { force: true/false })
 * Admin Only
 */
router.post("/cron-trigger", adminOnly, async (req, res) => {
  try {
    const force = req.body?.force === true;
    const result = await runAutoMonthCloseJob(force);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/fees/close-month
 * Close a month and handle dues
 * Admin Only
 * Body: { month: "YYYY-MM" }
 */
router.post("/close-month", adminOnly, closeMonth);

/**
 * GET /api/fees/dues/:student_id
 * Get dues for a student
 * Admin or Teacher
 */
router.get("/dues/:student_id", adminOrTeacher, getStudentDues);

/**
 * GET /api/fees/list?class=&section=&month=
 * Get fee list for dashboard
 * Admin or Teacher
 */
router.get("/list", adminOrTeacher, getFeeList);

/**
 * POST /api/fees/pay
 * Record fee payment
 * Admin Only
 * Body: { class, section, roll_number, amount_paid, payment_mode, payment_date?, month?, transaction_id? }
 * - transaction_id (optional): an idempotency key provided by caller to prevent duplicate payments on retry.
 */
router.post("/pay", adminOnly, payFee);

/**
 * GET /api/fees/invoice/:bill_id
 * Get invoice details
 * Admin or Teacher
 */
router.get("/invoice/:bill_id", adminOrTeacher, getInvoice);

export default router;

