
import express from "express";
import { getResultByClassRoll } from "../controllers/marks.controller.js";

const router = express.Router();
router.get("/", getResultByClassRoll);
export default router;
