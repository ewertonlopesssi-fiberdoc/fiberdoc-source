import PDFDocument from "pdfkit";
import { getTubesByCeo, getTubesByCto, getViasByCeo, getViasByCto, getCeoById, getCtoById } from "./db";

const TUBE_COLOR_HEX: Record<string, string> = {
  blue: "#3b82f6", orange: "#f97316", green: "#10b981", brown: "#92400e",
  slate: "#94a3b8", white: "#e5e7eb", red: "#ef4444", black: "#18181b",
  yellow: "#facc15", violet: "#8b5cf6", rose: "#f472b6", aqua: "#22d3ee",
};

export async function generateFusionReportPdf(
  type: "ceo" | "cto",
  refId: number
): Promise<Buffer> {
  const tubes = type === "ceo" ? await getTubesByCeo(refId) : await getTubesByCto(refId);
  const allVias = type === "ceo" ? await getViasByCeo(refId) : await getViasByCto(refId);
  const entity = type === "ceo" ? await getCeoById(refId) : await getCtoById(refId);
  const entityName = (entity as any)?.name ?? (type === "ceo" ? "CEO" : "CTO");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 80; // largura útil
    const DARK = "#0f1117";
    const CYAN = "#22d3ee";
    const MUTED = "#6b7280";
    const WHITE = "#f9fafb";
    const FUSED_BG = "#164e63";
    const FREE_BG = "#14532d";

    // ── Fundo ───────────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(DARK);

    // ── Cabeçalho ───────────────────────────────────────────────────────────
    doc.rect(40, 40, W, 50).fill("#1e2130");
    doc.fontSize(18).fillColor(CYAN).font("Helvetica-Bold")
      .text("FiberDoc — Relatório de Fusões", 50, 52, { width: W - 20 });
    doc.fontSize(10).fillColor(MUTED).font("Helvetica")
      .text(
        `${type.toUpperCase()}: ${entityName}  |  Gerado em: ${new Date().toLocaleString("pt-BR")}`,
        50, 74, { width: W - 20 }
      );

    let y = 110;

    // ── Resumo ──────────────────────────────────────────────────────────────
    const totalVias = allVias.length;
    const fusedVias = allVias.filter(v => v.fusedToViaId !== null).length;
    const freeVias = totalVias - fusedVias;

    doc.rect(40, y, W, 36).fill("#1e2130");
    doc.fontSize(9).fillColor(MUTED).font("Helvetica")
      .text("TUBOS", 50, y + 6).text("VIAS TOTAL", 160, y + 6)
      .text("FUSIONADAS", 270, y + 6).text("LIVRES", 380, y + 6);
    doc.fontSize(14).fillColor(WHITE).font("Helvetica-Bold")
      .text(String(tubes.length), 50, y + 18)
      .text(String(totalVias), 160, y + 18)
      .text(String(fusedVias), 270, y + 18);
    doc.fillColor("#4ade80").text(String(freeVias), 380, y + 18);

    y += 52;

    // ── Tubos e Vias ────────────────────────────────────────────────────────
    for (const tube of tubes) {
      const vias = allVias
        .filter(v => v.tubeId === tube.id)
        .sort((a, b) => a.viaNumber - b.viaNumber);

      if (vias.length === 0) continue;

      // Verificar espaço na página
      if (y + 28 + vias.length * 22 > doc.page.height - 60) {
        doc.addPage();
        doc.rect(0, 0, doc.page.width, doc.page.height).fill(DARK);
        y = 40;
      }

      // Cabeçalho do tubo
      const tubeColor = TUBE_COLOR_HEX[tube.color ?? "slate"] ?? "#94a3b8";
      doc.rect(40, y, W, 24).fill("#1a1f2e");
      doc.rect(40, y, 4, 24).fill(tubeColor);
      doc.fontSize(10).fillColor(WHITE).font("Helvetica-Bold")
        .text(
          `${tube.type === "splitter" ? "⊕" : "○"} ${tube.identifier}  (${vias.length} vias)`,
          52, y + 7, { width: W - 20 }
        );
      y += 28;

      // Vias
      for (const via of vias) {
        if (y + 22 > doc.page.height - 60) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, doc.page.height).fill(DARK);
          y = 40;
        }

        const isFused = via.fusedToViaId !== null;
        const rowBg = isFused ? FUSED_BG : FREE_BG;
        doc.rect(44, y, W - 4, 20).fill(rowBg);

        // Número da via
        doc.fontSize(9).fillColor(WHITE).font("Helvetica-Bold")
          .text(`Via ${via.viaNumber}`, 50, y + 5, { width: 50 });

        // Label da via
        doc.fontSize(9).fillColor(via.label ? WHITE : MUTED).font("Helvetica")
          .text(via.label ?? "—", 110, y + 5, { width: 180 });

        // Status / fusão
        if (isFused) {
          const dest = allVias.find(v => v.id === via.fusedToViaId);
          const destTube = dest ? tubes.find(t => t.id === dest.tubeId) : null;
          const fusedLabel = dest
            ? `→ Via ${dest.viaNumber}${dest.label ? ` — ${dest.label}` : ""}${destTube ? ` (${destTube.identifier})` : ""}`
            : "→ ?";
          doc.fontSize(8).fillColor(CYAN).font("Helvetica")
            .text(fusedLabel, 300, y + 6, { width: W - 260 });
        } else {
          doc.fontSize(8).fillColor("#4ade80").font("Helvetica")
            .text("LIVRE", 300, y + 6, { width: 60 });
        }

        y += 22;
      }

      y += 6;
    }

    // ── Rodapé ───────────────────────────────────────────────────────────────
    const pageCount = (doc as any)._pageBuffer?.length ?? 1;
    doc.fontSize(8).fillColor(MUTED).font("Helvetica")
      .text(
        `FiberDoc — Sistema de Documentação de Fibras  |  Página 1 de ${pageCount}`,
        40, doc.page.height - 30, { width: W, align: "center" }
      );

    doc.end();
  });
}
