import fs from "fs";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import { supabase } from "./supabase.js";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(process.cwd(), "uploads", "cached_pdfs");
const CACHE_FILE = path.join(DATA_DIR, "pdf_cache.json");

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-memory cache store
let cacheStore = {
  results: {},
  bills: {},
};

function loadCacheFromFile() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      cacheStore = {
        results: parsed.results || {},
        bills: parsed.bills || {},
      };
    }
  } catch (err) {
    console.error("Error reading PDF cache file:", err);
  }
}

function saveCacheToFile() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheStore, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving PDF cache file:", err);
  }
}

// Initial load
loadCacheFromFile();

function configureCloudinary() {
  cloudinary.config({
    cloud_name: String(process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    api_key: String(process.env.CLOUDINARY_API_KEY || "").trim(),
    api_secret: String(process.env.CLOUDINARY_API_SECRET || "").trim(),
  });
}

const isCloudinaryConfigured = () => {
  return Boolean(
    String(process.env.CLOUDINARY_CLOUD_NAME || "").trim() &&
    String(process.env.CLOUDINARY_API_KEY || "").trim() &&
    String(process.env.CLOUDINARY_API_SECRET || "").trim()
  );
};

/**
 * Upload a PDF buffer to Cloudinary (with local disk fallback)
 */
export async function uploadPdfBuffer(buffer, { filename, folder = "sps_results" }) {
  const safeFilename = String(filename || `doc-${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  // 1. Always write local fallback copy
  const localFolder = path.join(UPLOADS_DIR, folder);
  if (!fs.existsSync(localFolder)) {
    fs.mkdirSync(localFolder, { recursive: true });
  }
  const localFilePath = path.join(localFolder, `${safeFilename}.pdf`);
  fs.writeFileSync(localFilePath, buffer);
  const localRelativeUrl = `/uploads/cached_pdfs/${folder}/${safeFilename}.pdf`;

  // 2. Try Cloudinary upload if configured
  if (isCloudinaryConfigured()) {
    try {
      configureCloudinary();
      const base64Data = `data:application/pdf;base64,${buffer.toString("base64")}`;
      const cloudResp = await cloudinary.uploader.upload(base64Data, {
        folder: `sps/${folder}`,
        public_id: safeFilename,
        resource_type: "auto",
        format: "pdf",
        overwrite: true,
      });

      if (cloudResp?.secure_url) {
        return {
          url: cloudResp.secure_url,
          provider: "cloudinary",
          public_id: cloudResp.public_id,
          local_fallback: localRelativeUrl,
        };
      }
    } catch (err) {
      console.warn("Cloudinary PDF upload failed, falling back to local server file:", err.message);
    }
  }

  return {
    url: localRelativeUrl,
    provider: "local",
    public_id: safeFilename,
  };
}

/**
 * Result PDF Helpers
 */
export function buildResultCacheKey({ session = "default", className = "all", section = "A", roll = "1", terminal = "First" }) {
  const sMatch = String(session || "").match(/\d{4}/);
  const s = sMatch ? sMatch[0] : String(session).trim().toLowerCase();
  const c = String(className).trim().toLowerCase().replace(/\s+/g, "");
  const sec = String(section || "A").trim().toLowerCase();
  const r = String(roll).trim();
  const t = String(terminal).trim().toLowerCase();
  return `res_${s}_c${c}_s${sec}_r${r}_t${t}`;
}

export function getCachedResultPdf(params) {
  const key = buildResultCacheKey(params);
  const item = cacheStore.results[key];
  if (!item || !item.url) return null;
  return item;
}

export function setCachedResultPdf(params, data) {
  const key = buildResultCacheKey(params);
  cacheStore.results[key] = {
    ...data,
    key,
    updated_at: new Date().toISOString(),
  };
  saveCacheToFile();

  // Async sync with Supabase dedicated table
  try {
    supabase
      .from("cached_document_pdfs")
      .upsert(
        {
          cache_key: key,
          doc_type: "result",
          student_id: data.student_id || null,
          session: params.session ? String(params.session) : null,
          class_name: params.className ? String(params.className) : null,
          section: params.section ? String(params.section) : "A",
          roll_no: params.roll ? String(params.roll) : null,
          terminal: params.terminal ? String(params.terminal) : null,
          pdf_url: data.url,
          local_path: data.local_fallback || null,
          provider: data.provider || "cloudinary",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" }
      )
      .then(({ error }) => {
        if (error && error.code !== "PGRST205") {
          console.warn("DB cached_document_pdfs upsert notice:", error.message);
        }
      })
      .catch(() => {});
  } catch (_) {}

  return cacheStore.results[key];
}

export function invalidateResultPdf(params = {}) {
  const { session, className, section, roll, terminal } = params;
  if (!session && !className && !roll && !terminal) {
    cacheStore.results = {};
    saveCacheToFile();
    return;
  }

  // If specific roll/terminal provided
  if (session && className && roll && terminal) {
    const key = buildResultCacheKey({ session, className, section, roll, terminal });
    delete cacheStore.results[key];
    saveCacheToFile();
    return;
  }

  // Broad invalidation by partial match
  const c = className ? String(className).trim().toLowerCase().replace(/\s+/g, "") : null;
  const t = terminal ? String(terminal).trim().toLowerCase() : null;

  Object.keys(cacheStore.results).forEach((k) => {
    let match = true;
    if (c && !k.includes(`_c${c}_`)) match = false;
    if (t && !k.endsWith(`_t${t}`)) match = false;
    if (match) {
      delete cacheStore.results[k];
    }
  });

  // Sync delete with Supabase table
  try {
    if (session && className && roll && terminal) {
      const key = buildResultCacheKey({ session, className, section, roll, terminal });
      supabase.from("cached_document_pdfs").delete().eq("cache_key", key).catch(() => {});
    } else {
      let query = supabase.from("cached_document_pdfs").delete().eq("doc_type", "result");
      if (className) query = query.ilike("class_name", `%${className}%`);
      if (terminal) query = query.ilike("terminal", `%${terminal}%`);
      query.then(() => {}).catch(() => {});
    }
  } catch (_) {}

  saveCacheToFile();
}

/**
 * Bill / Receipt PDF Helpers
 */
export function getCachedBillPdf(billId) {
  const key = String(billId).trim();
  return cacheStore.bills[key] || null;
}

export function setCachedBillPdf(billId, data) {
  const key = String(billId).trim();
  cacheStore.bills[key] = {
    ...data,
    billId,
    updated_at: new Date().toISOString(),
  };
  saveCacheToFile();

  // Async sync with Supabase dedicated table
  try {
    supabase
      .from("cached_document_pdfs")
      .upsert(
        {
          cache_key: key,
          doc_type: "bill",
          bill_id: billId,
          pdf_url: data.url,
          local_path: data.local_fallback || null,
          provider: data.provider || "cloudinary",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" }
      )
      .then(({ error }) => {
        if (error && error.code !== "PGRST205") {
          console.warn("DB cached_document_pdfs bill upsert notice:", error.message);
        }
      })
      .catch(() => {});
  } catch (_) {}

  return cacheStore.bills[key];
}

export function invalidateBillPdf(billId) {
  const key = String(billId).trim();
  if (cacheStore.bills[key]) {
    delete cacheStore.bills[key];
    saveCacheToFile();
  }
  try {
    supabase.from("cached_document_pdfs").delete().eq("cache_key", key).then(() => {}).catch(() => {});
  } catch (_) {}
}
