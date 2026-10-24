import express from "express";
import {
  getDocumentTemplates,
  selectActiveTemplate,
  customizeTemplate,
  resetTemplateDefaults,
} from "../controllers/documentTemplates.controller.js";
import { adminOnly, adminTeacherOrStudent } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * GET /api/document-templates
 * Fetch current active templates and customization for all 4 categories.
 * Accessible to authenticated users (admin, teacher, student).
 */
router.get("/", adminTeacherOrStudent, getDocumentTemplates);

/**
 * POST /api/document-templates/select
 * Select active design template for a category (ID Card, Admit Card, TC, Marksheet).
 * Admin Only.
 */
router.post("/select", adminOnly, selectActiveTemplate);

/**
 * POST /api/document-templates/customize
 * Save customized settings (colors, logo, signatures, headers) for a category.
 * Admin Only.
 */
router.post("/customize", adminOnly, customizeTemplate);

/**
 * POST /api/document-templates/reset
 * Reset category back to factory default template and styling.
 * Admin Only.
 */
router.post("/reset", adminOnly, resetTemplateDefaults);

export default router;
