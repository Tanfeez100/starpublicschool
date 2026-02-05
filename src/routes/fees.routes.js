import express from "express";
import {
  closeMonth,
  getStudentDues,
  getFeeList,
  payFee,
  getInvoice,
} from "../controllers/fees.controller.js";
import { adminOnly, adminOrTeacher } from "../middleware/auth.middleware.js";

const router = express.Router();

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
 * Body: { class, roll_number, amount_paid, payment_mode, payment_date?, month? }
 */
router.post("/pay", adminOnly, payFee);

/**
 * GET /api/fees/invoice/:bill_id
 * Get invoice details
 * Admin or Teacher
 */
router.get("/invoice/:bill_id", adminOrTeacher, getInvoice);

export default router;

