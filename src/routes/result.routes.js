
import express from "express";
import { getResultByClassRoll } from "../controllers/marks.controller.js";
import { getResultAvailability } from "../controllers/result.controller.js";

const router = express.Router();
router.get("/availability", getResultAvailability);
router.get("/", getResultByClassRoll);
export default router;
