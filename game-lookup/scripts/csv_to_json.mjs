import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Papa from "papaparse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is the parent of /scripts
const projectRoot = path.resolve(__dirname, "..");

const csvPath = path.join(projectRoot, "data", "combined.csv");
const jsonPath = path.join(projectRoot, "data", "games.json");

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(csvPath)) fail(`CSV not found: ${csvPath}`);

console.log(`📄 Reading: ${csvPath}`);

const csvText = fs.readFileSync(csvPath, "utf8");
const parsed = Papa.parse(csvText, {
  header: true,
  skipEmptyLines: true,
});

if (parsed.errors?.length) {
  console.error("❌ CSV parse errors:");
  for (const e of parsed.errors) console.error(e);
  process.exit(1);
}

const rows = Array.isArray(parsed.data) ? parsed.data : [];
fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");

console.log(`✅ Wrote ${rows.length} rows to: ${jsonPath}`);
