import express from "express";
import {
  createFeeStructure,
  getFeeStructures,
  updateFeeStructure,
  deleteFeeStructure,
} from "../controllers/feeStructure.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * POST /api/fee-structure
 * Create a new fee structure entry
 * Admin Only
 * Body: { class, section?, fee_name, fee_amount, is_optional? }
 */
router.post("/", adminOnly, createFeeStructure);

/**
 * GET /api/fee-structure?class=&section=
 * Get fee structures with optional filters
 * Admin Only
 */
router.get("/", adminOnly, getFeeStructures);

/**
 * PUT /api/fee-structure/:id
 * Update fee structure
 * Admin Only
 * Body: { class?, section?, fee_name?, fee_amount?, is_optional? }
 */
router.put("/:id", adminOnly, updateFeeStructure);

/**
 * DELETE /api/fee-structure/:id
 * Delete fee structure
 * Admin Only
 */
router.delete("/:id", adminOnly, deleteFeeStructure);

export default router;

