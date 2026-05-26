import express from "express";
import {
  createPublicFeeOrder,
  downloadPublicReceipt,
  getPublicFeePaymentStatus,
  lookupPublicFees,
  verifyPublicFeePayment,
} from "../controllers/publicFees.controller.js";

const router = express.Router();

router.post("/lookup", lookupPublicFees);
router.post("/order", createPublicFeeOrder);
router.post("/verify", verifyPublicFeePayment);
router.get("/status/:order_id", getPublicFeePaymentStatus);
router.get("/receipt/:bill_id", downloadPublicReceipt);

export default router;

