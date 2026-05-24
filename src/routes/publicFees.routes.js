import express from "express";
import {
  createPublicFeeOrder,
  downloadPublicReceipt,
  lookupPublicFees,
  verifyPublicFeePayment,
} from "../controllers/publicFees.controller.js";

const router = express.Router();

router.post("/lookup", lookupPublicFees);
router.post("/order", createPublicFeeOrder);
router.post("/verify", verifyPublicFeePayment);
router.get("/receipt/:bill_id", downloadPublicReceipt);

export default router;

