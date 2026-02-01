import fs from "fs";
import path from "path";

function escapeNewlinesForEnv(privateKey) {
  // Convert real newlines into \n so it can live in a single .env line
  return privateKey.replace(/\r?\n/g, "\\n");
}

function main() {
  const jsonPath =
    process.argv[2] || path.resolve(process.cwd(), "service-account.json");

  if (!fs.existsSync(jsonPath)) {
    console.error(`service-account json not found: ${jsonPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, "utf8");
  const sa = JSON.parse(raw);

  if (!sa.client_email || !sa.private_key) {
    console.error("Invalid service-account JSON: missing client_email/private_key");
    process.exit(1);
  }

  const clientEmail = sa.client_email;
  const privateKey = escapeNewlinesForEnv(sa.private_key);

  // IMPORTANT: do not print folder id (depends on your Drive folder)
  console.log(`GOOGLE_CLIENT_EMAIL=${clientEmail}`);
  // Print without wrapping quotes to be compatible with Node's --env-file parser
  console.log(`GOOGLE_PRIVATE_KEY=${privateKey}`);
  console.log(`GOOGLE_DRIVE_FOLDER_ID=PASTE_YOUR_FOLDER_ID_HERE`);
}

main();


