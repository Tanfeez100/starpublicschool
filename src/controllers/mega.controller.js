import { getMegaFolderPath, parseBoolean } from "../config/mega.js";
import { ensureMegaFolder, getMegaStorage } from "../services/megaStorage.js";

function pickUploadedFile(req) {
  if (req.file) return req.file;
  const files = req.files || {};
  if (Array.isArray(files.image) && files.image[0]) return files.image[0];
  if (Array.isArray(files.file) && files.file[0]) return files.file[0];
  return null;
}

function pickUploadedFiles(req) {
  const files = req.files || {};
  const out = [];

  // support multiple common keys
  for (const key of ["images", "image", "files", "file"]) {
    const arr = files[key];
    if (Array.isArray(arr) && arr.length) out.push(...arr);
  }

  // de-dup by multer internal filename if present
  const seen = new Set();
  return out.filter((f) => {
    const k = f?.originalname || f?.filename || Math.random().toString(36);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function normalizeMegaError(err) {
  const message = err?.message || "Unknown MEGA error";
  return { status: 500, message };
}

async function createMegaLinkSafe(file) {
  try {
    return await file.link();
  } catch {
    return null;
  }
}

async function findMegaFileByNodeId(storage, nodeId) {
  if (!nodeId) return null;
  await storage.reload(true);
  const direct = storage.files?.[nodeId] || null;
  if (direct) return direct;
  const all = Object.values(storage.files || {});
  return all.find((f) => f?.nodeId === nodeId) || null;
}

export async function uploadSingleImage(req, res) {
  try {
    const isPublic = parseBoolean(req.query.public, false);

    const file = pickUploadedFile(req);
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
        hint: "Send multipart/form-data with field name `image` (or `file`).",
      });
    }

    const storage = await getMegaStorage();
    const folderPath = getMegaFolderPath({ isPublic });
    const folder = await ensureMegaFolder(storage, folderPath);

    const uploadStream = folder.upload(
      { name: file.originalname || `upload-${Date.now()}`, size: file.size },
      file.buffer
    );
    const uploaded = await uploadStream.complete;

    const publicUrl = isPublic ? await uploaded.link() : null;

    return res.status(201).json({
      success: true,
      public: isPublic,
      folderPathUsed: folderPath.join("/"),
      file: {
        name: uploaded.name,
        size: uploaded.size,
        nodeId: uploaded.nodeId,
        url: publicUrl,
      },
    });
  } catch (err) {
    const e = normalizeMegaError(err);
    return res.status(e.status).json({
      success: false,
      message: "Failed to upload image to MEGA",
      error: e.message,
      hint: "Check MEGA_EMAIL / MEGA_PASSWORD in .env and ensure the account has available storage.",
    });
  }
}

export async function uploadBulkImages(req, res) {
  try {
    const isPublic = parseBoolean(req.query.public, false);

    const files = pickUploadedFiles(req);
    if (!files.length) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
        hint:
          "Send multipart/form-data with field name `images` (multiple) or multiple `image` fields.",
      });
    }

    const storage = await getMegaStorage();
    const folderPath = getMegaFolderPath({ isPublic });
    const folder = await ensureMegaFolder(storage, folderPath);

    const results = [];
    for (const f of files) {
      const uploadStream = folder.upload(
        { name: f.originalname || `upload-${Date.now()}`, size: f.size },
        f.buffer
      );
      const uploaded = await uploadStream.complete;
      const url = isPublic ? await createMegaLinkSafe(uploaded) : null;
      results.push({
        name: uploaded.name,
        size: uploaded.size,
        nodeId: uploaded.nodeId,
        url,
      });
    }

    return res.status(201).json({
      success: true,
      public: isPublic,
      folderPathUsed: folderPath.join("/"),
      count: results.length,
      files: results,
    });
  } catch (err) {
    const e = normalizeMegaError(err);
    return res.status(e.status).json({
      success: false,
      message: "Failed to upload images to MEGA",
      error: e.message,
      hint: "Check MEGA_EMAIL / MEGA_PASSWORD in .env and ensure the account has available storage.",
    });
  }
}

export async function listImages(req, res) {
  try {
    const isPublic = parseBoolean(req.query.public, false);
    const includeLinks = parseBoolean(req.query.includeLinks, true);

    const storage = await getMegaStorage();
    const folderPath = getMegaFolderPath({ isPublic });
    const folder = await ensureMegaFolder(storage, folderPath);
    await storage.reload(false);

    const children = Array.isArray(folder.children) ? folder.children : [];
    const files = children.filter((c) => c && !c.directory);

    const out = [];
    for (const f of files) {
      const url = includeLinks ? await createMegaLinkSafe(f) : null;
      out.push({
        name: f.name,
        size: f.size,
        nodeId: f.nodeId,
        url,
      });
    }

    return res.status(200).json({
      success: true,
      public: isPublic,
      folderPathUsed: folderPath.join("/"),
      count: out.length,
      files: out,
    });
  } catch (err) {
    const e = normalizeMegaError(err);
    return res.status(e.status).json({
      success: false,
      message: "Failed to list MEGA images",
      error: e.message,
      hint: "Check MEGA_EMAIL / MEGA_PASSWORD in .env",
    });
  }
}

export async function deleteImage(req, res) {
  try {
    const nodeId = String(req.params.nodeId || "").trim();
    if (!nodeId) {
      return res.status(400).json({
        success: false,
        message: "Missing nodeId",
      });
    }

    const storage = await getMegaStorage();
    const file = await findMegaFileByNodeId(storage, nodeId);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: "File not found",
        nodeId,
      });
    }

    await file.delete(true);
    return res.status(200).json({
      success: true,
      message: "Deleted",
      nodeId,
    });
  } catch (err) {
    const e = normalizeMegaError(err);
    return res.status(e.status).json({
      success: false,
      message: "Failed to delete MEGA image",
      error: e.message,
    });
  }
}


