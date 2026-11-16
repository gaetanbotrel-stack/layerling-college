import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Hébergement dans un sous-dossier (LAYERLING_BASE_PATH=/modelisation3d) : les pages statiques que Next.js ne
// produit pas (le guide, view.html, support.html) contiennent des liens absolus du type "/guide-fr/..." qui
// renverraient à la racine du site. Ce script ajoute le sous-dossier devant, dans les fichiers de l'export.
// Sans LAYERLING_BASE_PATH, il ne fait rien.
const base = (process.env.LAYERLING_BASE_PATH ?? "").trim().replace(/\/+$/, "");
if (!base) {
  console.log("prefix-base-path: no base path, nothing to do.");
  process.exit(0);
}
if (!base.startsWith("/")) throw new Error(`LAYERLING_BASE_PATH must start with "/": ${base}`);

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const exportRoot = join(repositoryRoot, "apps", "web", ".next-export");

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "_next" || entry.name === "occt") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// "/x" -> base + "/x", but not "//host", and not what already carries the base.
function prefix(path) {
  if (path.startsWith("//") || path === base || path.startsWith(`${base}/`)) return path;
  return base + path;
}

const ATTRIBUTE = /\b(href|src|action|data-index|data-src)=(["'])\/(?!\/)([^"']*)\2/g;
const CSS_URL = /url\((["']?)\/(?!\/)([^)"']*)\1\)/g;
const JSON_URL = /("u"\s*:\s*")(\/[^"]*)"/g;

let changed = 0;
for await (const file of walk(exportRoot)) {
  const lower = file.toLowerCase();
  const kind = lower.endsWith(".html") ? "html" : lower.endsWith(".css") ? "css" : lower.endsWith("search-index.json") ? "json" : null;
  if (!kind) continue;
  const before = await readFile(file, "utf8");
  let after = before;
  if (kind === "html") {
    // Version scolaire : pas de page de dons, de forum ni de notes de version dans le pied de page du guide.
    // Le lien vers le code source ("Le projet sur GitHub") reste : la licence AGPL l'exige.
    after = after.replace(/<footer class="note">.*?<\/footer>/s, "");
    // Premier bloc du pied de page : don + forum (le forum change selon la langue).
    after = after.replace(/<div><a href="https:\/\/layerling\.com\/support\.html[^"]*"[^>]*>.*?<\/div>/g, "");
    after = after.replace(/<span class="dot"[^>]*>&middot;<\/span><a href="https:\/\/github\.com\/henmedia\/layerling\/releases"[^>]*>[^<]*<\/a>/g, "");
    after = after.replace(ATTRIBUTE, (_m, name, quote, rest) => `${name}=${quote}${prefix("/" + rest)}${quote}`);
    after = after.replace(CSS_URL, (_m, quote, rest) => `url(${quote}${prefix("/" + rest)}${quote})`);
  } else if (kind === "css") {
    after = after.replace(CSS_URL, (_m, quote, rest) => `url(${quote}${prefix("/" + rest)}${quote})`);
  } else {
    after = after.replace(JSON_URL, (_m, head, path) => `${head}${prefix(path)}"`);
  }
  if (after !== before) {
    await writeFile(file, after);
    changed += 1;
  }
}
console.log(`prefix-base-path: ${changed} file(s) updated with ${base}.`);
