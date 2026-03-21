export function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(v)) return true;
  if (["false", "0", "no", "n"].includes(v)) return false;
  return defaultValue;
}

export function getMegaCreds() {
  const email = (process.env.MEGA_EMAIL || "kumarvishnu65834@gmail.com").trim();
  const password = process.env.MEGA_PASSWORD || "Vs703252@";
  return { email, password };
}

export function getMegaFolderPath({ isPublic }) {
  const publicPath =
    process.env.MEGA_PUBLIC_FOLDER_PATH ||
    process.env.MEGA_FOLDER_PATH ||
    "public";
  const privatePath =
    process.env.MEGA_PRIVATE_FOLDER_PATH ||
    process.env.MEGA_FOLDER_PATH ||
    "private";

  return String(isPublic ? publicPath : privatePath)
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}


