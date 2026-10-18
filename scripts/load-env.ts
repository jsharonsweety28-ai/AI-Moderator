// Next.js loads .env.local automatically; standalone scripts must do it themselves.
// Import this before anything that calls llmConfig().
import { readFileSync } from "node:fs";
import path from "node:path";

try {
  const raw = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("#") || !line.includes("=")) continue;
    const key = line.slice(0, line.indexOf("=")).trim();
    const value = line.slice(line.indexOf("=") + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
} catch {
  // No .env.local — rely on the ambient environment.
}
