import { Storage } from "megajs";
import { getMegaCreds } from "../config/mega.js";

let cachedStoragePromise = null;

export async function getMegaStorage() {
  if (cachedStoragePromise) return cachedStoragePromise;

  cachedStoragePromise = (async () => {
    const { email, password } = getMegaCreds();
    if (!email || !password) {
      throw new Error(
        "MEGA credentials missing. Set MEGA_EMAIL and MEGA_PASSWORD in .env"
      );
    }

    const storage = new Storage({
      email,
      password,
      autologin: true,
      autoload: true,
    });

    await storage.ready;
    return storage;
  })();

  return cachedStoragePromise;
}

export async function ensureMegaFolder(storage, pathParts) {
  let dir = storage.root;

  // Make sure we have children loaded
  await storage.reload(false);

  for (const part of pathParts) {
    const existing =
      dir.children?.find((c) => c.directory && c.name === part) || null;
    if (existing) {
      dir = existing;
      continue;
    }
    dir = await dir.mkdir(part);
    // refresh children for next step
    await storage.reload(false);
  }

  return dir;
}


