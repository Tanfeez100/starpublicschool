
import express from "express";
import { getResult } from "../controllers/result.controller.js";

const router = express.Router();
router.get("/", getResult);
export default router;
