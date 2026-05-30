import express from "express";
import multer from "multer";
import { adminOrTeacher } from "../middleware/auth.middleware.js";
import {
  deleteImage,
  listImages,
  listPublicImages,
  uploadBulkImages,
  uploadSingleImage,
} from "../controllers/mega.controller.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

// Accept either `image` or `file` field
const uploadAnySingle = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

const uploadAnyBulk = upload.fields([
  { name: "images", maxCount: 20 },
  { name: "image", maxCount: 20 },
  { name: "files", maxCount: 20 },
  { name: "file", maxCount: 20 },
]);

router.post("/images", adminOrTeacher, uploadAnySingle, uploadSingleImage);
router.post("/images/bulk", adminOrTeacher, uploadAnyBulk, uploadBulkImages);
router.get("/images/public", listPublicImages);
router.get("/images", adminOrTeacher, listImages);
router.delete("/images/:nodeId", adminOrTeacher, deleteImage);

export default router;


