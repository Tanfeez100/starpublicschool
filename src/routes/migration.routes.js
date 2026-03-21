import express from "express";
import { migrateOpeningBalance } from "../controllers/migration.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * POST /api/migration/opening-balance
 * Admin Only
 */
router.post("/opening-balance", adminOnly, migrateOpeningBalance);

export default router;
