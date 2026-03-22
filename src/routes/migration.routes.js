import express from "express";
import multer from "multer";
import { migrateOpeningBalance, releaseMigrationLockRoute, cancelMigrationRoute, migrateFromExcelFile } from "../controllers/migration.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

// Configure multer for file uploads (memory storage for Excel files)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    // Accept only Excel files
    const allowedMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-excel", // .xls
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files (.xlsx, .xls) are allowed"));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max file size
  },
});

/**
 * POST /api/migration/opening-balance
 * Admin Only
 */
router.post("/opening-balance", adminOnly, migrateOpeningBalance);

/**
 * POST /api/migration/from-excel
 * Admin Only - Batch migrate from Excel file
 * Accepts multipart/form-data with: file (required), migration_month (required)
 */
router.post("/from-excel", adminOnly, upload.single("file"), migrateFromExcelFile);

/**
 * POST /api/migration/release-lock
 * For testing purposes - temporarily no auth required
 */
router.post("/release-lock", releaseMigrationLockRoute);

/**
 * POST /api/migration/cancel
 * Admin Only - Force cancel ongoing migration
 */
router.post("/cancel", adminOnly, cancelMigrationRoute);

export default router;
