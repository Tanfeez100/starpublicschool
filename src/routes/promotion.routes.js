import express from "express";
import { promoteClass } from "../controllers/promotion.controller.js";
import { adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

// POST /api/promotions/class
router.post("/class", adminOnly, promoteClass);

export default router;
