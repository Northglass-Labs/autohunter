import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const collectorRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = resolve(collectorRoot, "src");

function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function moduleSpecifiers(source, file) {
  const specifiers = [];
  const literalDynamicImports = [...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)];
  const dynamicImportCount = [...source.matchAll(/\bimport\s*\(/g)].length;
  assert.equal(literalDynamicImports.length, dynamicImportCount, `scheduled graph contains a non-literal dynamic import: ${file}`);
  assert.doesNotMatch(source, /\b(?:createRequire|require)\s*\(/, `scheduled graph contains an opaque CommonJS import: ${file}`);
  const patterns = [
    /(?:^|\n)\s*import\s+(?:[^"'();]*?\s+from\s+)?["']([^"']+)["']/g,
    /(?:^|\n)\s*export\s+[^"'();]*?\s+from\s+["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  specifiers.push(...literalDynamicImports.map((match) => match[1]));
  return specifiers;
}

async function sourceModules(directory = sourceRoot) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceModules(path));
    else if (entry.isFile() && entry.name.endsWith(".mjs")) files.push(path);
  }
  return files;
}

async function scheduledGraph(entrypoints) {
  const files = new Set();
  const packages = new Set();

  async function visit(file) {
    if (files.has(file)) return;
    files.add(file);
    for (const specifier of moduleSpecifiers(await readFile(file, "utf8"), relative(sourceRoot, file))) {
      if (!specifier.startsWith(".")) {
        if (!specifier.startsWith("node:")) packages.add(packageName(specifier));
        continue;
      }
      let target = resolve(dirname(file), specifier);
      if (!extname(target)) target += ".mjs";
      const fromSourceRoot = relative(sourceRoot, target);
      assert.ok(fromSourceRoot && !fromSourceRoot.startsWith(`..${sep}`) && fromSourceRoot !== "..", `scheduled import escaped collector/src: ${specifier}`);
      await visit(target);
    }
  }

  for (const entrypoint of entrypoints) await visit(resolve(sourceRoot, entrypoint));
  return {
    files: [...files].map((file) => relative(sourceRoot, file)).sort(),
    packages: [...packages].sort(),
  };
}

test("scheduled entrypoints cannot reach the retired browser collector", async () => {
  const graph = await scheduledGraph(["platform.mjs", "platform-cycle.mjs"]);
  assert.deepEqual(graph.packages, ["zipcodes"]);
  assert.ok(!graph.files.includes("browser.mjs"));
  assert.ok(!graph.files.includes("collect.mjs"));
});

test("legacy browser packages are development-only", async () => {
  const manifest = JSON.parse(await readFile(resolve(collectorRoot, "package.json"), "utf8"));
  const lock = JSON.parse(await readFile(resolve(collectorRoot, "package-lock.json"), "utf8"));
  assert.equal(manifest.dependencies?.["camoufox-js"], undefined);
  assert.equal(manifest.dependencies?.["playwright-core"], undefined);
  assert.equal(manifest.devDependencies?.["camoufox-js"], "0.11.2");
  assert.equal(manifest.devDependencies?.["playwright-core"], "1.61.1");
  assert.equal(lock.packages?.["node_modules/camoufox-js"]?.dev, true);
  assert.equal(lock.packages?.["node_modules/playwright-core"]?.dev, true);
});

test("legacy browser import edges stay confined to their attestation-gated entrypoint", async () => {
  const allowedReferences = new Map([
    ["camoufox-js", new Set(["browser.mjs"])],
    ["./browser.mjs", new Set(["collect.mjs"])],
    ["./collect.mjs", new Set(["cycle.mjs"])],
  ]);
  for (const file of await sourceModules()) {
    const relativeFile = relative(sourceRoot, file);
    const source = await readFile(file, "utf8");
    for (const [reference, allowedFiles] of allowedReferences) {
      if (source.includes(reference)) assert.ok(allowedFiles.has(relativeFile), `${reference} is reachable from unexpected module ${relativeFile}`);
    }
  }
});
