import PDFDocument from "pdfkit";
import { getTubesByCto, getViasByCtotube, getCtoById } from "./db";
import { getSgpConfig } from "./db";

interface OnuInfo {
  porta: number | null;
  clienteName: string;
  status: string;
  signal: string;
}

async function fetchOnusByCto(sgpCtoId: number): Promise<OnuInfo[]> {
  const cfg = await getSgpConfig();
  if (!cfg || !cfg.active) return [];
  try {
    const base = cfg.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/api/fttx/splitter/${sgpCtoId}/onu/list/`, {
      headers: { token: cfg.token, app: cfg.app },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const onus: any[] = Array.isArray(data) ? data : (data.results ?? data.data ?? []);
    return onus.map((o: any) => ({
      porta: o.onu ?? o.porta ?? null,
      clienteName: o.cliente_nome ?? o.nome ?? o.login ?? o.contrato_login ?? "",
      status: o.status ?? o.online ?? "",
      signal: o.rx_power ?? o.sinal ?? o.signal ?? "",
    }));
  } catch {
    return [];
  }
}

export async function generateSgpOccupancyReportPdf(ctoId: number): Promise<Buffer> {
  const cto = await getCtoById(ctoId);
  if (!cto) throw new Error("CTO não encontrada");

  const tubes = await getTubesByCto(ctoId);

  // Buscar ONUs do SGP se a CTO tiver sgpId
  const sgpOnus: OnuInfo[] = cto.sgpId ? await fetchOnusByCto(cto.sgpId) : [];
  const onuByPorta = new Map<number, OnuInfo>();
  for (const onu of sgpOnus) {
    if (onu.porta !== null) onuByPorta.set(onu.porta, onu);
  }

  // Buscar vias de todos os tubos
  const tubesWithVias: Array<{ tube: any; vias: any[] }> = [];
  for (const tube of tubes) {
    const vias = await getViasByCtotube(tube.id);
    tubesWithVias.push({ tube, vias });
  }

  const totalVias = tubesWithVias.reduce((acc, t) => acc + t.vias.length, 0);
  const occupiedVias = tubesWithVias.reduce((acc, t) => acc + t.vias.filter((v: any) => v.label || v.fusedToViaId).length, 0);
  const freeVias = totalVias - occupiedVias;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const PAGE_W = doc.page.width - 80;
    const COL_VIA = 40;
    const COL_LABEL = 120;
    const COL_STATUS = 90;
    const COL_SIGNAL = 70;
    const COL_CLIENTE = PAGE_W - COL_VIA - COL_LABEL - COL_STATUS - COL_SIGNAL;

    // ── Cabeçalho ──────────────────────────────────────────────────────────────
    doc.fontSize(18).fillColor("#0e7490").text("FiberDoc — Relatório de Ocupação SGP", 40, 40);
    doc.fontSize(11).fillColor("#374151").text(`CTO: ${cto.name}`, 40, 68);
    doc.text(`Endereço: ${cto.address ?? "—"}`, 40, 82);
    doc.text(`Capacidade: ${cto.capacity} portas  |  Ocupadas: ${occupiedVias}  |  Livres: ${freeVias}`, 40, 96);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 40, 110);
    if (sgpOnus.length > 0) {
      doc.text(`ONUs SGP encontradas: ${sgpOnus.length}`, 40, 124);
    }

    let y = sgpOnus.length > 0 ? 144 : 130;

    // ── Tabela por tubo ────────────────────────────────────────────────────────
    for (const { tube, vias } of tubesWithVias) {
      if (y > doc.page.height - 100) { doc.addPage(); y = 40; }

      // Cabeçalho do tubo
      doc.rect(40, y, PAGE_W, 18).fill("#0e7490");
      doc.fontSize(9).fillColor("#ffffff")
        .text(`Tubo: ${tube.identifier}  (${tube.type ?? "tubo"})  — ${vias.length} vias`, 44, y + 4, { width: PAGE_W - 8 });
      y += 18;

      // Cabeçalho das colunas
      doc.rect(40, y, PAGE_W, 14).fill("#e0f2fe");
      doc.fontSize(8).fillColor("#0c4a6e");
      doc.text("Via", 44, y + 3, { width: COL_VIA });
      doc.text("Etiqueta FiberDoc", 44 + COL_VIA, y + 3, { width: COL_LABEL });
      doc.text("Cliente SGP", 44 + COL_VIA + COL_LABEL, y + 3, { width: COL_CLIENTE });
      doc.text("Status ONU", 44 + COL_VIA + COL_LABEL + COL_CLIENTE, y + 3, { width: COL_STATUS });
      doc.text("Sinal", 44 + COL_VIA + COL_LABEL + COL_CLIENTE + COL_STATUS, y + 3, { width: COL_SIGNAL });
      y += 14;

      // Linhas das vias
      for (const via of vias) {
        if (y > doc.page.height - 60) { doc.addPage(); y = 40; }
        const isOccupied = !!(via.label || via.fusedToViaId);
        const onu = onuByPorta.get(via.number);
        const bgColor = isOccupied ? "#f0fdf4" : "#fafafa";
        doc.rect(40, y, PAGE_W, 13).fill(bgColor);
        doc.rect(40, y, PAGE_W, 13).stroke("#e5e7eb");

        doc.fontSize(8).fillColor(isOccupied ? "#166534" : "#6b7280");
        doc.text(String(via.number), 44, y + 3, { width: COL_VIA });
        doc.text(via.label ?? (via.fusedToViaId ? "Fusionada" : "Livre"), 44 + COL_VIA, y + 3, { width: COL_LABEL, ellipsis: true });
        doc.text(onu?.clienteName ?? "—", 44 + COL_VIA + COL_LABEL, y + 3, { width: COL_CLIENTE, ellipsis: true });

        // Status ONU com cor
        const statusText = onu ? (onu.status === "1" || onu.status === "online" || String(onu.status) === "true" ? "Online" : "Offline") : "—";
        const statusColor = statusText === "Online" ? "#166534" : statusText === "Offline" ? "#991b1b" : "#6b7280";
        doc.fillColor(statusColor).text(statusText, 44 + COL_VIA + COL_LABEL + COL_CLIENTE, y + 3, { width: COL_STATUS });
        doc.fillColor("#374151").text(onu?.signal ? `${onu.signal} dBm` : "—", 44 + COL_VIA + COL_LABEL + COL_CLIENTE + COL_STATUS, y + 3, { width: COL_SIGNAL });
        y += 13;
      }
      y += 8;
    }

    // ── Rodapé ─────────────────────────────────────────────────────────────────
    doc.fontSize(7).fillColor("#9ca3af")
      .text("FiberDoc — Sistema de Documentação de Infraestrutura de Rede Óptica", 40, doc.page.height - 30, { align: "center", width: PAGE_W });

    doc.end();
  });
}
