// update-sw-version.mjs
// Atualiza APP_VERSION no sw.js com a versão do package.json
import { existsSync, readFileSync, writeFileSync } from "fs";

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

// ─── Carimbo da versão dentro do bundle do cliente ──────────────────────────
// O cliente precisa saber com que build ele foi carregado, para comparar com
// o que o servidor está servindo e avisar quando a aba ficou para trás.
// É um arquivo gerado em vez de `define` no vite.config porque assim o tsc
// enxerga a constante sem precisar de declaração global, e o valor fica
// visível no diff de cada release.
const buildVersionPath = "client/src/lib/buildVersion.ts";
const buildVersionSrc = `// GERADO AUTOMATICAMENTE por update-sw-version.mjs — não editar à mão.
// Roda antes do \`vite build\`, junto com o carimbo de versão do sw.js.
export const APP_VERSION = "${version}";
`;
const buildVersionAtual = existsSync(buildVersionPath)
  ? readFileSync(buildVersionPath, "utf8")
  : null;
if (buildVersionAtual !== buildVersionSrc) {
  writeFileSync(buildVersionPath, buildVersionSrc, "utf8");
  console.log(`[update-sw-version] buildVersion.ts atualizado para v${version}`);
}
