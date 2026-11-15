import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(read("module.json"));

test("release manifest has 5.0.1 metadata and existing entry points", () => {
  assert.equal(manifest.id, "cypher-taskbar");
  assert.equal(manifest.version, "5.0.1");
  assert.equal(manifest.type, "module");
  assert.deepEqual(manifest.esmodules, ["scripts/cypher-taskbar.js"]);
  assert.equal(manifest.compatibility.minimum, "14");
  assert.equal(manifest.relationships.systems[0].id, "cyphersystem");
  assert.equal(manifest.relationships.systems[0].compatibility.minimum, "3.5.2");
  for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map(entry => entry.path)]) {
    assert.ok(existsSync(fileURLToPath(new URL(path, root))), `Missing release entry: ${path}`);
  }
});

test("release URLs point to the correct repository and archive", () => {
  assert.ok(manifest.manifest.startsWith("https://github.com/Mario-28/cypher-taskbar/"));
  assert.ok(manifest.readme.startsWith("https://github.com/Mario-28/cypher-taskbar/"));
  assert.ok(manifest.changelog.startsWith("https://github.com/Mario-28/cypher-taskbar/"));
  assert.ok(manifest.bugs.startsWith("https://github.com/Mario-28/cypher-taskbar/"));
  assert.equal(manifest.download, "https://github.com/Mario-28/cypher-taskbar/releases/download/v5.0.1/cypher-taskbar-5.0.1.zip");
});

test("localization and release documentation parse and cover migration and verification", () => {
  const language = JSON.parse(read("languages/en.json"));
  for (const section of ["GlobalDefaults", "Review", "Cash", "Tasks", "Mini", "Errors"]) {
    assert.ok(language.CYPHER_TASKBAR[section], `Missing localization section ${section}`);
  }
  for (const document of ["README.md", "CHANGELOG.md", "MIGRATION.md", "VERIFICATION.md"]) {
    assert.ok(read(document).length > 500, `${document} is missing or incomplete`);
  }
  assert.ok(read("MIGRATION.md").includes("taskbarPrefs"));
  assert.ok(read("VERIFICATION.md").includes("does **not** prove live installation"));
});

test("current source headers and routine logging follow release policy", () => {
  assert.ok(read("scripts/cypher-taskbar.js").startsWith("/**\n * Cypher Taskbar v5.0.1"));
  assert.ok(read("styles/cypher-taskbar.css").includes("CYPHER TASKBAR v5.0.1"));
  const sourceFiles = ["cypher-taskbar.js", "combat-bar.js", "settings.js", "utils.js"];
  for (const file of sourceFiles) {
    const lines = read(`scripts/${file}`).split("\n");
    for (const [index, line] of lines.entries()) {
      if (line.includes("console.log")) {
        assert.ok(line.includes("CONFIG.debug?.cypherTaskbar"), `${file}:${index + 1} has ungated routine logging`);
      }
    }
  }
});
