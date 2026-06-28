import express from "express";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import { getMyFeeDashboard } from "../controllers/studentFees.controller.js";

const router = express.Router();

router.get("/me", authenticate, authorize("student"), getMyFeeDashboard);

export default router;
