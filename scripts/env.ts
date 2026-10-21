// Load .env.local / .env for CLI scripts the same way `next dev` does (existing env vars win).
import fs from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
