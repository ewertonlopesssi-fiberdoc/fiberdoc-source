import PDFDocument from "pdfkit";
import { getDb } from "./db";
import { equipments, rooms } from "../drizzle/schema";
import { eq, asc } from "drizzle-orm";

const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  switch: "Switch",
  olt: "OLT",
  dgo: "DGO",
  splitter: "Splitter",
  router: "Roteador",
  server: "Servidor",
  patch_panel: "Patch Panel",
  amplifier: "Amplificador",
  other: "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  maintenance: "Manutenção",
};

export async function generateEquipmentReportPdf(): Promise<Buffer> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Buscar todos os equipamentos com sala
  const rows = await db
    .select({
      id: equipments.id,
      name: equipments.name,
      type: equipments.type,
      model: equipments.model,
      manufacturer: equipments.manufacturer,
      status: equipments.status,
      vlan: (equipments as any).vlan,
      interfaceIp: (equipments as any).interfaceIp,
      serviceDescription: (equipments as any).serviceDescription,
      roomId: equipments.roomId,
      roomName: rooms.name,
    })
    .from(equipments)
    .leftJoin(rooms, eq(equipments.roomId, rooms.id))
    .orderBy(asc(rooms.name), asc(equipments.name));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 40, bottom: 40, left: 40, right: 40 },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const DARK_BG = "#0f1117";
    const CARD_BG = "#1a1d2e";
    const PRIMARY = "#6366f1";
    const TEXT = "#e2e8f0";
    const MUTED = "#64748b";
    const BORDER = "#2d3748";
    const GREEN = "#10b981";
    const YELLOW = "#f59e0b";
    const RED = "#ef4444";

    // ── Capa ──────────────────────────────────────────────────────────────────
    doc.rect(0, 0, W, doc.page.height).fill(DARK_BG);

    // Faixa lateral esquerda
    doc.rect(0, 0, 8, doc.page.height).fill(PRIMARY);

    // Logo / título
    doc.fontSize(28).fillColor(TEXT).font("Helvetica-Bold")
      .text("FiberDoc", 50, 60);
    doc.fontSize(14).fillColor(MUTED).font("Helvetica")
      .text("Sistema de Documentação de Fibras e Equipamentos", 50, 96);

    doc.moveDown(2);

    // Título do relatório
    doc.rect(40, 140, W - 80, 56).fill(CARD_BG);
    doc.fontSize(20).fillColor(PRIMARY).font("Helvetica-Bold")
      .text("Relatório de Equipamentos", 56, 154);

    // Subtítulo com data
    const now = new Date();
    doc.fontSize(10).fillColor(MUTED).font("Helvetica")
      .text(`Gerado em ${now.toLocaleString("pt-BR")}  ·  ${rows.length} equipamento(s)`, 56, 178);

    // KPIs
    const active = rows.filter((r) => r.status === "active").length;
    const inactive = rows.filter((r) => r.status === "inactive").length;
    const maintenance = rows.filter((r) => r.status === "maintenance").length;
    const withIp = rows.filter((r) => r.interfaceIp).length;
    const withVlan = rows.filter((r) => r.vlan).length;

    const kpis = [
      { label: "Total", value: String(rows.length), color: PRIMARY },
      { label: "Ativos", value: String(active), color: GREEN },
      { label: "Inativos", value: String(inactive), color: RED },
      { label: "Manutenção", value: String(maintenance), color: YELLOW },
      { label: "Com IP", value: String(withIp), color: PRIMARY },
      { label: "Com VLAN", value: String(withVlan), color: PRIMARY },
    ];

    const kpiW = (W - 80 - 10 * (kpis.length - 1)) / kpis.length;
    let kpiX = 40;
    kpis.forEach((k) => {
      doc.rect(kpiX, 220, kpiW, 60).fill(CARD_BG);
      doc.rect(kpiX, 220, kpiW, 3).fill(k.color);
      doc.fontSize(22).fillColor(k.color).font("Helvetica-Bold")
        .text(k.value, kpiX, 233, { width: kpiW, align: "center" });
      doc.fontSize(8).fillColor(MUTED).font("Helvetica")
        .text(k.label, kpiX, 258, { width: kpiW, align: "center" });
      kpiX += kpiW + 10;
    });

    // ── Tabela principal ──────────────────────────────────────────────────────
    doc.addPage();
    doc.rect(0, 0, W, doc.page.height).fill(DARK_BG);
    doc.rect(0, 0, 8, doc.page.height).fill(PRIMARY);

    doc.fontSize(14).fillColor(TEXT).font("Helvetica-Bold")
      .text("Listagem Completa de Equipamentos", 50, 40);
    doc.fontSize(9).fillColor(MUTED).font("Helvetica")
      .text(`${rows.length} equipamento(s) cadastrado(s)`, 50, 58);

    // Cabeçalho da tabela
    const cols = [
      { label: "Equipamento", x: 50, w: 130 },
      { label: "Tipo", x: 188, w: 70 },
      { label: "Modelo / Fabricante", x: 266, w: 120 },
      { label: "Sala / Local", x: 394, w: 100 },
      { label: "Status", x: 502, w: 60 },
      { label: "VLAN", x: 570, w: 45 },
      { label: "Interface / IP", x: 623, w: 100 },
      { label: "Serviço", x: 731, w: 100 },
    ];

    let y = 78;
    doc.rect(40, y, W - 80, 18).fill(CARD_BG);
    cols.forEach((c) => {
      doc.fontSize(7).fillColor(MUTED).font("Helvetica-Bold")
        .text(c.label.toUpperCase(), c.x, y + 5, { width: c.w, lineBreak: false });
    });
    y += 18;

    // Linhas
    rows.forEach((row, i) => {
      const rowH = 20;
      if (y + rowH > doc.page.height - 50) {
        doc.addPage();
        doc.rect(0, 0, W, doc.page.height).fill(DARK_BG);
        doc.rect(0, 0, 8, doc.page.height).fill(PRIMARY);
        y = 40;
        // Repetir cabeçalho
        doc.rect(40, y, W - 80, 18).fill(CARD_BG);
        cols.forEach((c) => {
          doc.fontSize(7).fillColor(MUTED).font("Helvetica-Bold")
            .text(c.label.toUpperCase(), c.x, y + 5, { width: c.w, lineBreak: false });
        });
        y += 18;
      }

      if (i % 2 === 0) doc.rect(40, y, W - 80, rowH).fill("#161929");

      const statusColor = row.status === "active" ? GREEN : row.status === "inactive" ? RED : YELLOW;

      // Nome
      doc.fontSize(8).fillColor(TEXT).font("Helvetica-Bold")
        .text(row.name ?? "", cols[0].x, y + 6, { width: cols[0].w, lineBreak: false });
      // Tipo
      doc.fontSize(8).fillColor(MUTED).font("Helvetica")
        .text(EQUIPMENT_TYPE_LABELS[row.type ?? ""] ?? row.type ?? "", cols[1].x, y + 6, { width: cols[1].w, lineBreak: false });
      // Modelo / Fabricante
      const modelStr = [row.model, row.manufacturer].filter(Boolean).join(" / ");
      doc.fontSize(7).fillColor(MUTED).font("Helvetica")
        .text(modelStr || "—", cols[2].x, y + 6, { width: cols[2].w, lineBreak: false });
      // Sala
      doc.fontSize(8).fillColor(TEXT).font("Helvetica")
        .text(row.roomName ?? "—", cols[3].x, y + 6, { width: cols[3].w, lineBreak: false });
      // Status
      doc.fontSize(7).fillColor(statusColor).font("Helvetica-Bold")
        .text(STATUS_LABELS[row.status ?? ""] ?? row.status ?? "", cols[4].x, y + 6, { width: cols[4].w, lineBreak: false });
      // VLAN
      doc.fontSize(8).fillColor(row.vlan ? PRIMARY : MUTED).font("Helvetica")
        .text(row.vlan ? String(row.vlan) : "—", cols[5].x, y + 6, { width: cols[5].w, lineBreak: false });
      // Interface/IP
      doc.fontSize(7).fillColor(row.interfaceIp ? TEXT : MUTED).font("Helvetica")
        .text(row.interfaceIp ?? "—", cols[6].x, y + 6, { width: cols[6].w, lineBreak: false });
      // Serviço
      doc.fontSize(7).fillColor(MUTED).font("Helvetica")
        .text(row.serviceDescription ?? "—", cols[7].x, y + 6, { width: cols[7].w, lineBreak: false });

      // Linha separadora
      doc.moveTo(40, y + rowH).lineTo(W - 40, y + rowH).strokeColor(BORDER).lineWidth(0.3).stroke();
      y += rowH;
    });

    // ── Rodapé ────────────────────────────────────────────────────────────────
    const totalPages = (doc as any)._pageBuffer?.length ?? 2;
    doc.fontSize(8).fillColor(MUTED).font("Helvetica")
      .text(`FiberDoc  ·  Relatório de Equipamentos  ·  ${now.toLocaleDateString("pt-BR")}`, 40, doc.page.height - 30, {
        width: W - 80,
        align: "center",
      });

    doc.end();
  });
}
