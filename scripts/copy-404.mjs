import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const distDir = join(scriptDir, "../dist");

copyFileSync(join(distDir, "index.html"), join(distDir, "404.html"));
