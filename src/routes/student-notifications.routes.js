import express from "express";
import { authenticate, authorize } from "../middleware/auth.middleware.js";
import {
  getMyNotifications,
  readNotification,
  registerPushToken,
} from "../controllers/studentNotifications.controller.js";

const router = express.Router();

router.post("/register-token", authenticate, authorize("student"), registerPushToken);
router.get("/me", authenticate, authorize("student"), getMyNotifications);
router.patch("/:notificationId/read", authenticate, authorize("student"), readNotification);

export default router;

