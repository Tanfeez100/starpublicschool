import express from "express";
import {
  getFees,
  generateFee,
  generateBulkFees,
  payFee,
  closeMonth,
  getInvoice,
  saveFeeStructure,
  getFeeStructureByClass,
  testConnection,
} from "../controllers/fee.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

// Test endpoint to diagnose database issues (Public for debugging)
router.get("/test", testConnection);

// All fee routes - Admin Only
router.get("/", adminOnly, getFees);
router.post("/generate", adminOnly, generateFee);
router.post("/generate-bulk", adminOnly, generateBulkFees);
router.put("/pay/:id", adminOnly, payFee);
router.post("/close-month", adminOnly, closeMonth);
router.get("/invoice/:id", adminOnly, getInvoice);
router.post("/structure", adminOnly, saveFeeStructure);
router.get("/structure/:className", adminOnly, getFeeStructureByClass);

export default router;
