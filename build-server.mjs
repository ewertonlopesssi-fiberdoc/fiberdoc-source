#!/usr/bin/env node
/**
 * Script de build do servidor para produção.
 * Usa um plugin esbuild para substituir server/_core/vite.ts pelo stub de produção,
 * evitando que o pacote 'vite' (devDependency) seja incluído no bundle.
 */
import { build } from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viteProdStubPath = path.resolve(__dirname, "server/_core/vite.prod.ts");

// Plugin que substitui vite.ts pelo stub de produção
const viteProdStubPlugin = {
  name: "vite-prod-stub",
  setup(build) {
    // Interceptar qualquer importação que resolva para o ficheiro vite.ts
    build.onResolve({ filter: /.*/ }, (args) => {
      // Verificar se é uma importação do vite.ts (relativa ou absoluta)
      if (
        args.path === "./vite" ||
        args.path === "./vite.js" ||
        args.path === "./vite.ts" ||
        args.path.endsWith("/server/_core/vite.ts") ||
        args.path.endsWith("/server/_core/vite.js")
      ) {
        console.log(`[vite-prod-stub] Intercepting: ${args.path} from ${args.importer}`);
        return { path: viteProdStubPath };
      }
    });
  },
};

await build({
  entryPoints: ["server/_core/index.ts"],
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  outdir: "dist",
  plugins: [viteProdStubPlugin],
});

console.log("✓ Server bundle built successfully (vite excluded from production bundle)");
