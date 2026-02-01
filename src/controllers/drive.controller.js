import {
  deleteDriveFile,
  downloadDriveFileStream,
  getDriveFileMeta,
  listImagesInFolder,
  updateDriveFileContent,
  uploadBufferToDrive,
} from "../services/googleDrive.js";

function isTrue(val) {
  return String(val).toLowerCase() === "true";
}

function pickDriveErrorMessage(err) {
  return (
    err?.response?.data?.error?.message ||
    err?.cause?.message ||
    err?.message ||
    "Unknown error"
  );
}

function driveHttpStatus(err) {
  const code = err?.code || err?.status || err?.response?.status;
  const n = Number(code);
  if (Number.isFinite(n) && n >= 400 && n < 600) return n;
  return 500;
}

function driveHint(errMsg) {
  const msg = String(errMsg || "");
  if (
    msg.includes("ERR_OSSL_UNSUPPORTED") ||
    msg.toLowerCase().includes("decoder routines::unsupported") ||
    msg.toLowerCase().includes("invalid_private_key")
  ) {
    return "Private key format issue. In .env set GOOGLE_PRIVATE_KEY as ONE LINE with \\n (no real newlines). Prefer generating via: node scripts/print-drive-env.js service-account.json";
  }
  if (msg.toLowerCase().includes("file not found")) {
    return "Folder ID / File ID is wrong OR Drive folder is not shared with the service-account email. Also make sure you didn't paste an extra '.' at the end of the id.";
  }
  if (msg.toLowerCase().includes("insufficient") || msg.toLowerCase().includes("permission")) {
    return "Permission issue: share the target Drive folder with the service-account email as Editor.";
  }
  return undefined;
}

function ensureImageFile(file) {
  if (!file) return "File is required";
  if (!file.mimetype || !file.mimetype.startsWith("image/")) {
    return `Only image/* files are allowed. Received: ${file.mimetype || "unknown"}`;
  }
  return null;
}

export const uploadSingleImage = async (req, res) => {
  try {
    const errMsg = ensureImageFile(req.file);
    if (errMsg) return res.status(400).json({ success: false, message: errMsg });

    const folderId =
      req.query.folderId && String(req.query.folderId).includes("{{")
        ? undefined
        : req.query.folderId;
    const makePublic = isTrue(req.query.public);
    const name =
      req.body?.name ||
      req.file.originalname ||
      `image_${Date.now()}.bin`;

    const file = await uploadBufferToDrive({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      name,
      folderId,
      makePublic,
    });

    return res.status(201).json({ success: true, file });
  } catch (err) {
    const errMsg = pickDriveErrorMessage(err);
    const status = driveHttpStatus(err);
    console.error("Drive uploadSingleImage error:", err);
    return res.status(status).json({
      success: false,
      message: "Failed to upload image to Google Drive",
      error: errMsg,
      code: err.code,
      hint: driveHint(errMsg),
    });
  }
};

export const uploadBulkImages = async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res
        .status(400)
        .json({ success: false, message: "images[] files are required" });
    }

    const folderId =
      req.query.folderId && String(req.query.folderId).includes("{{")
        ? undefined
        : req.query.folderId;
    const makePublic = isTrue(req.query.public);

    const uploads = await Promise.allSettled(
      files.map((f) =>
        uploadBufferToDrive({
          buffer: f.buffer,
          mimeType: f.mimetype,
          name: f.originalname || `image_${Date.now()}.bin`,
          folderId,
          makePublic,
        })
      )
    );

    const success = [];
    const failed = [];

    uploads.forEach((r, idx) => {
      if (r.status === "fulfilled") success.push({ index: idx, file: r.value });
      else
        failed.push({
          index: idx,
          name: files[idx]?.originalname,
          error: r.reason?.message || String(r.reason),
        });
    });

    return res.status(failed.length ? 207 : 201).json({
      success: failed.length === 0,
      uploaded: success.length,
      failed: failed.length,
      results: { success, failed },
    });
  } catch (err) {
    const errMsg = pickDriveErrorMessage(err);
    const status = driveHttpStatus(err);
    console.error("Drive uploadBulkImages error:", err);
    return res.status(status).json({
      success: false,
      message: "Failed to bulk upload images to Google Drive",
      error: errMsg,
      code: err.code,
      hint: driveHint(errMsg),
    });
  }
};

export const listImages = async (req, res) => {
  try {
    const folderId =
      req.query.folderId && String(req.query.folderId).includes("{{")
        ? undefined
        : req.query.folderId;
    const pageSize = req.query.pageSize;
    const pageToken = req.query.pageToken;

    const data = await listImagesInFolder({ folderId, pageSize, pageToken });
    return res.json({ success: true, ...data });
  } catch (err) {
    const errMsg = pickDriveErrorMessage(err);
    const status = driveHttpStatus(err);
    console.error("Drive listImages error:", err);
    return res.status(status).json({
      success: false,
      message: "Failed to list images from Google Drive",
      error: errMsg,
      code: err.code,
      hint: driveHint(errMsg),
    });
  }
};

export const getImageMeta = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await getDriveFileMeta(id);
    return res.json({ success: true, file });
  } catch (err) {
    const errMsg = pickDriveErrorMessage(err);
    const status = driveHttpStatus(err);
    console.error("Drive getImageMeta error:", err);
    return res.status(status).json({
      success: false,
      message: "Failed to get file metadata from Google Drive",
      error: errMsg,
      code: err.code,
      hint: driveHint(errMsg),
    });
  }
};

export const downloadImage = async (req, res) => {
  try {
    const { id } = req.params;

    // Get metadata to set headers nicely
    let meta = null;
    try {
      meta = await getDriveFileMeta(id);
    } catch {
      // ignore meta failure; still attempt stream
    }

    const stream = await downloadDriveFileStream(id);
    if (meta?.mimeType) res.setHeader("Content-Type", meta.mimeType);
    if (meta?.name) {
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(meta.name)}"`
      );
    }
    stream.on("error", (e) => {
      console.error("Drive download stream error:", e);
      if (!res.headersSent) res.status(500).json({ success: false, message: "Download failed" });
    });
    stream.pipe(res);
  } catch (err) {
    const errMsg = pickDriveErrorMessage(err);
    const status = driveHttpStatus(err);
    console.error("Drive downloadImage error:", err);
    return res.status(status).json({
      success: false,
      message: "Failed to download file from Google Drive",
      error: errMsg,
      code: err.code,
      hint: driveHint(errMsg),
    });
  }
};

export const replaceImage = async (req, res) => {
  try {
    const { id } = req.params;
    const errMsg = ensureImageFile(req.file);
    if (errMsg) return res.status(400).json({ success: false, message: errMsg });

    const name = req.body?.name;

    const file = await updateDriveFileContent({
      fileId: id,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      name,
    });

    return res.json({ success: true, file });
  } catch (err) {
    const errMsg = pickDriveErrorMessage(err);
    const status = driveHttpStatus(err);
    console.error("Drive replaceImage error:", err);
    return res.status(status).json({
      success: false,
      message: "Failed to update image on Google Drive",
      error: errMsg,
      code: err.code,
      hint: driveHint(errMsg),
    });
  }
};

export const deleteImage = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await deleteDriveFile(id);
    return res.json({ success: true, ...result });
  } catch (err) {
    const errMsg = pickDriveErrorMessage(err);
    const status = driveHttpStatus(err);
    console.error("Drive deleteImage error:", err);
    return res.status(status).json({
      success: false,
      message: "Failed to delete file from Google Drive",
      error: errMsg,
      code: err.code,
      hint: driveHint(errMsg),
    });
  }
};


