// update-sw-version.mjs
// Atualiza APP_VERSION no sw.js com a versão do package.json
import { readFileSync, writeFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;

const swPath = "client/public/sw.js";
let sw = readFileSync(swPath, "utf8");

// Substituir APP_VERSION pela versão atual do package.json
sw = sw.replace(
  /const APP_VERSION = "[^"]+";/,
  `const APP_VERSION = "${version}";`
);
// Atualizar também o comentário da versão
sw = sw.replace(
  /\/\/ FiberDoc Service Worker — v[^\n]+/,
  `// FiberDoc Service Worker — v${version}`
);

writeFileSync(swPath, sw, "utf8");
console.log(`[update-sw-version] sw.js atualizado para v${version}`);
