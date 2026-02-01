import { google } from "googleapis";
import { Readable } from "stream";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

let _drive = null;

function normalizeDriveId(id) {
  if (!id) return id;
  // Drive ids are typically [a-zA-Z0-9_-]. Users often paste with trailing '.' or spaces.
  return String(id).trim().replace(/[^\w-]/g, "");
}

function stripWrappingQuotes(val) {
  if (val == null) return val;
  const s = String(val).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function sanitizePrivateKey(val) {
  const raw = stripWrappingQuotes(val);
  if (!raw) return raw;
  // Common when storing private key in .env: newlines are escaped as \n
  return raw.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
}

function canParsePrivateKey(privateKey) {
  try {
    crypto.createPrivateKey({ key: privateKey });
    return true;
  } catch {
    return false;
  }
}

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    const err = new Error(`Missing required env: ${name}`);
    err.code = "MISSING_ENV";
    throw err;
  }
  return val;
}

function tryReadServiceAccountJson() {
  const jsonPath =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    path.resolve(process.cwd(), "service-account.json");

  try {
    if (!fs.existsSync(jsonPath)) return null;
    const raw = fs.readFileSync(jsonPath, "utf8");
    const sa = JSON.parse(raw);
    if (!sa?.client_email || !sa?.private_key) return null;
    return { clientEmail: sa.client_email, privateKey: sa.private_key };
  } catch {
    return null;
  }
}

function getDriveCredentials() {
  const envEmail = stripWrappingQuotes(process.env.GOOGLE_CLIENT_EMAIL);
  const envKeyRaw = process.env.GOOGLE_PRIVATE_KEY;
  const envKey = sanitizePrivateKey(envKeyRaw);

  // Prefer env if present
  if (envEmail && envKey && canParsePrivateKey(envKey)) {
    return {
      clientEmail: envEmail,
      privateKey: envKey,
      source: "env",
    };
  }

  // Fallback to service-account.json (local dev convenience)
  const sa = tryReadServiceAccountJson();
  if (sa?.clientEmail && sa?.privateKey) {
    return { ...sa, source: "service-account.json" };
  }

  // Throw the most relevant missing env message for user
  if (!envEmail) requireEnv("GOOGLE_CLIENT_EMAIL");
  if (!envKeyRaw) requireEnv("GOOGLE_PRIVATE_KEY");

  const err = new Error(
    "GOOGLE_PRIVATE_KEY is present but invalid. Ensure it is a single line with \\n escapes (no extra quotes)."
  );
  err.code = "INVALID_PRIVATE_KEY";
  throw err;
  // Unreachable
  return null;
}

export function getDriveClient() {
  if (_drive) return _drive;

  const { clientEmail, privateKey } = getDriveCredentials();

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: SCOPES,
  });

  _drive = google.drive({ version: "v3", auth });
  return _drive;
}

export function getDefaultFolderId() {
  return normalizeDriveId(requireEnv("GOOGLE_DRIVE_FOLDER_ID"));
}

export async function uploadBufferToDrive({
  buffer,
  mimeType,
  name,
  folderId,
  makePublic = false,
}) {
  const drive = getDriveClient();
  const parent = normalizeDriveId(folderId) || getDefaultFolderId();

  const createRes = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      parents: [parent],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields:
      "id,name,mimeType,size,webViewLink,webContentLink,createdTime,parents",
  });

  const file = createRes.data;

  if (makePublic) {
    await drive.permissions.create({
      fileId: file.id,
      requestBody: { type: "anyone", role: "reader" },
    });
  }

  return file;
}

export async function listImagesInFolder({ folderId, pageSize = 50, pageToken }) {
  const drive = getDriveClient();
  const parent = normalizeDriveId(folderId) || getDefaultFolderId();

  const q = [
    `'${parent}' in parents`,
    "trashed = false",
    "mimeType contains 'image/'",
  ].join(" and ");

  const res = await drive.files.list({
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    q,
    pageSize: Math.min(Number(pageSize) || 50, 1000),
    pageToken,
    fields:
      "nextPageToken,files(id,name,mimeType,size,webViewLink,webContentLink,createdTime,modifiedTime,parents)",
    orderBy: "createdTime desc",
  });

  return res.data;
}

export async function getDriveFileMeta(fileId) {
  const drive = getDriveClient();
  const id = normalizeDriveId(fileId);
  const res = await drive.files.get({
    fileId: id,
    supportsAllDrives: true,
    fields:
      "id,name,mimeType,size,webViewLink,webContentLink,createdTime,modifiedTime,parents,trashed",
  });
  return res.data;
}

export async function downloadDriveFileStream(fileId) {
  const drive = getDriveClient();
  const id = normalizeDriveId(fileId);
  const res = await drive.files.get(
    { fileId: id, alt: "media", supportsAllDrives: true },
    { responseType: "stream" }
  );
  return res.data; // stream
}

export async function updateDriveFileContent({
  fileId,
  buffer,
  mimeType,
  name,
}) {
  const drive = getDriveClient();
  const id = normalizeDriveId(fileId);

  const res = await drive.files.update({
    fileId: id,
    supportsAllDrives: true,
    requestBody: name ? { name } : undefined,
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields:
      "id,name,mimeType,size,webViewLink,webContentLink,createdTime,modifiedTime,parents",
  });

  return res.data;
}

export async function deleteDriveFile(fileId) {
  const drive = getDriveClient();
  const id = normalizeDriveId(fileId);
  await drive.files.delete({ fileId: id, supportsAllDrives: true });
  return { id, deleted: true };
}


