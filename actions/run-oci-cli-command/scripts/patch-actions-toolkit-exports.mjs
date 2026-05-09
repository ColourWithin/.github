import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

for (const [packageName, entrypoint] of [
  ["@actions/core", "./lib/core.js"],
  ["@actions/exec", "./lib/exec.js"]
]) {
  const packageRoot = join(process.cwd(), "node_modules", ...packageName.split("/"));
  const packageJsonPath = join(packageRoot, "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

  packageJson.exports = {
    ".": {
      ...packageJson.exports?.["."],
      require: entrypoint,
      default: entrypoint
    }
  };

  writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
}
