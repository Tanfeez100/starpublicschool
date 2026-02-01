import express from "express";
import multer from "multer";
import { adminOrTeacher } from "../middleware/auth.middleware.js";
import {
  deleteImage,
  downloadImage,
  getImageMeta,
  listImages,
  replaceImage,
  uploadBulkImages,
  uploadSingleImage,
} from "../controllers/drive.controller.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 50,
  },
  fileFilter: (req, file, cb) => {
    if (file?.mimetype?.startsWith("image/")) return cb(null, true);
    return cb(new Error("Only image/* files are allowed"));
  },
});

/**
 * Google Drive Images API (CRUD + Bulk)
 * Base: /api/drive
 *
 * Required env:
 * - GOOGLE_CLIENT_EMAIL
 * - GOOGLE_PRIVATE_KEY
 * - GOOGLE_DRIVE_FOLDER_ID
 */

// CREATE (single)
// POST /api/drive/images?public=true&folderId=...
// multipart/form-data: image=<file>, (optional) name=<string>
router.post("/images", adminOrTeacher, upload.single("image"), uploadSingleImage);

// CREATE (bulk)
// POST /api/drive/images/bulk?public=true&folderId=...
// multipart/form-data: images=<file> (multiple)
router.post(
  "/images/bulk",
  adminOrTeacher,
  upload.array("images", 50),
  uploadBulkImages
);

// READ (list)
// GET /api/drive/images?folderId=...&pageSize=50&pageToken=...
router.get("/images", adminOrTeacher, listImages);

// READ (meta)
// GET /api/drive/images/:id
router.get("/images/:id", adminOrTeacher, getImageMeta);

// READ (download/stream)
// GET /api/drive/images/:id/download
router.get("/images/:id/download", adminOrTeacher, downloadImage);

// UPDATE (replace content)
// PUT /api/drive/images/:id
// multipart/form-data: image=<file>, (optional) name=<string>
router.put(
  "/images/:id",
  adminOrTeacher,
  upload.single("image"),
  replaceImage
);

// DELETE
// DELETE /api/drive/images/:id
router.delete("/images/:id", adminOrTeacher, deleteImage);

export default router;


