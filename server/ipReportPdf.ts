import PDFDocument from "pdfkit";
import { Response } from "express";
import { getIpDashboardSummary, getIpAddressesByBlock } from "./ipdb";

// Cores do tema dark FiberDoc
const COLORS = {
  bg:         "#0f1117",
  surface:    "#1a1d27",
  border:     "#2a2d3a",
  primary:    "#6366f1",
  text:       "#e2e8f0",
  muted:      "#94a3b8",
  emerald:    "#34d399",
  yellow:     "#fbbf24",
  red:        "#f87171",
  blue:       "#60a5fa",
};

const STATUS_LABEL: Record<string, string> = {
  allocated: "Alocado",
  reserved:  "Reservado",
  dhcp:      "DHCP",
  free:      "Livre",
};

const TYPE_LABEL: Record<string, string> = {
  infrastructure: "Infraestrutura",
  clients:        "Clientes",
  management:     "Gerência",
  transit:        "Trânsito",
  loopback:       "Loopback",
  reserved:       "Reservado",
  other:          "Outro",
};

function statusColor(status: string): string {
  switch (status) {
    case "allocated": return COLORS.emerald;
    case "reserved":  return COLORS.yellow;
    case "dhcp":      return COLORS.blue;
    default:          return COLORS.muted;
  }
}

export async function generateIpReportPdf(res: Response) {
  const summary = await getIpDashboardSummary();
  const blocks = summary.blocks;

  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    info: {
      Title: "Relatório de Blocos IP — FiberDoc",
      Author: "FiberDoc Sistema",
      Subject: "Documentação de Endereçamento IP",
    },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="fiberdoc-ip-report-${new Date().toISOString().slice(0, 10)}.pdf"`
  );
  doc.pipe(res);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 40;
  const contentW = pageW - margin * 2;

  // ── Capa ─────────────────────────────────────────────────────────────────────
  doc.rect(0, 0, pageW, pageH).fill(COLORS.bg);

  // Barra lateral colorida
  doc.rect(0, 0, 6, pageH).fill(COLORS.primary);

  // Título principal
  doc.fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(28)
    .text("FiberDoc", margin, 80);

  doc.fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(14)
    .text("Relatório de Blocos IP", margin, 118);

  // Linha separadora
  doc.moveTo(margin, 145).lineTo(pageW - margin, 145).strokeColor(COLORS.border).lineWidth(1).stroke();

  // Data e totais
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(10)
    .text(`Gerado em ${dateStr} às ${timeStr}`, margin, 158);

  // Cards de resumo
  const totalBlocks = blocks.length;
  const totalHosts = blocks.reduce((s, b) => s + (b.totalHosts ?? 0), 0);
  const totalUsed  = blocks.reduce((s, b) => s + (b.used ?? 0), 0);
  const pctGlobal  = totalHosts > 0 ? Math.round((totalUsed / totalHosts) * 100) : 0;

  const cards = [
    { label: "Blocos",           value: String(totalBlocks) },
    { label: "Total de Hosts",   value: totalHosts.toLocaleString("pt-BR") },
    { label: "IPs Utilizados",   value: totalUsed.toLocaleString("pt-BR") },
    { label: "Utilização Global",value: `${pctGlobal}%` },
  ];

  const cardW = (contentW - 12) / 4;
  cards.forEach((card, i) => {
    const x = margin + i * (cardW + 4);
    doc.rect(x, 185, cardW, 56).fill(COLORS.surface);
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(card.label.toUpperCase(), x + 10, 196);
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(18).text(card.value, x + 10, 210);
  });

  // ── Tabela de Blocos ─────────────────────────────────────────────────────────
  doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(13)
    .text("Blocos IP Cadastrados", margin, 265);
  doc.moveTo(margin, 282).lineTo(pageW - margin, 282).strokeColor(COLORS.primary).lineWidth(1.5).stroke();

  // Cabeçalho da tabela
  const cols = {
    cidr:    { x: margin,       w: 130, label: "CIDR / Rede" },
    name:    { x: margin + 130, w: 110, label: "Nome" },
    type:    { x: margin + 240, w: 80,  label: "Tipo" },
    vlan:    { x: margin + 320, w: 50,  label: "VLAN" },
    hosts:   { x: margin + 370, w: 55,  label: "Hosts" },
    used:    { x: margin + 425, w: 50,  label: "Usados" },
    pct:     { x: margin + 475, w: 40,  label: "%" },
  };

  let y = 290;
  doc.rect(margin, y, contentW, 18).fill(COLORS.surface);
  Object.values(cols).forEach((col) => {
    doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7.5)
      .text(col.label, col.x + 4, y + 5, { width: col.w - 4, align: "left" });
  });
  y += 18;

  for (const block of blocks) {
    if (y > pageH - 80) {
      doc.addPage();
      doc.rect(0, 0, pageW, pageH).fill(COLORS.bg);
      doc.rect(0, 0, 6, pageH).fill(COLORS.primary);
      y = margin;
    }

    const pct = block.totalHosts > 0 ? Math.round(((block.used ?? 0) / block.totalHosts) * 100) : 0;
    const rowBg = y % 36 < 18 ? COLORS.bg : COLORS.surface;
    doc.rect(margin, y, contentW, 16).fill(rowBg);

    const rowData: Record<string, string> = {
      cidr:  block.cidr,
      name:  block.name,
      type:  TYPE_LABEL[block.type] ?? block.type,
      vlan:  block.vlan ? `${block.vlan}` : "—",
      hosts: block.totalHosts.toLocaleString("pt-BR"),
      used:  (block.used ?? 0).toLocaleString("pt-BR"),
      pct:   `${pct}%`,
    };

    const pctColor = pct >= 90 ? COLORS.red : pct >= 70 ? COLORS.yellow : COLORS.emerald;

    Object.entries(cols).forEach(([key, col]) => {
      const color = key === "pct" ? pctColor : COLORS.text;
      const font  = key === "cidr" ? "Courier" : "Helvetica";
      doc.fillColor(color).font(font).fontSize(8)
        .text(rowData[key], col.x + 4, y + 4, { width: col.w - 4, align: "left" });
    });

    y += 16;
  }

  // ── Detalhes por Bloco ───────────────────────────────────────────────────────
  for (const block of blocks) {
    const addresses = await getIpAddressesByBlock(block.id);
    const nonFree = addresses.filter((a) => a.status !== "free");
    if (nonFree.length === 0) continue;

    doc.addPage();
    doc.rect(0, 0, pageW, pageH).fill(COLORS.bg);
    doc.rect(0, 0, 6, pageH).fill(COLORS.primary);

    let dy = margin;

    // Cabeçalho do bloco
    doc.fillColor(COLORS.primary).font("Helvetica-Bold").fontSize(14)
      .text(block.name, margin, dy);
    dy += 18;
    doc.fillColor(COLORS.muted).font("Courier").fontSize(10)
      .text(block.cidr, margin, dy);
    dy += 14;

    if (block.description) {
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9)
        .text(block.description, margin, dy);
      dy += 12;
    }

    // Mini-cards do bloco
    const pct = block.totalHosts > 0 ? Math.round(((block.used ?? 0) / block.totalHosts) * 100) : 0;
    const miniCards = [
      { label: "Total de Hosts", value: block.totalHosts.toLocaleString("pt-BR") },
      { label: "Utilizados",     value: (block.used ?? 0).toLocaleString("pt-BR") },
      { label: "Utilização",     value: `${pct}%` },
      { label: "VLAN",           value: block.vlan ? `VLAN ${block.vlan}` : "—" },
    ];
    dy += 6;
    const mCardW = (contentW - 9) / 4;
    miniCards.forEach((mc, i) => {
      const mx = margin + i * (mCardW + 3);
      doc.rect(mx, dy, mCardW, 38).fill(COLORS.surface);
      doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7).text(mc.label.toUpperCase(), mx + 6, dy + 6);
      const vColor = mc.label === "Utilização" ? (pct >= 90 ? COLORS.red : pct >= 70 ? COLORS.yellow : COLORS.emerald) : COLORS.text;
      doc.fillColor(vColor).font("Helvetica-Bold").fontSize(14).text(mc.value, mx + 6, dy + 16);
    });
    dy += 48;

    // Barra de progresso
    const barW = contentW;
    doc.rect(margin, dy, barW, 6).fill(COLORS.surface);
    const fillW = Math.round(barW * pct / 100);
    const barColor = pct >= 90 ? COLORS.red : pct >= 70 ? COLORS.yellow : COLORS.emerald;
    if (fillW > 0) doc.rect(margin, dy, fillW, 6).fill(barColor);
    dy += 14;

    // Tabela de IPs
    doc.fillColor(COLORS.text).font("Helvetica-Bold").fontSize(10)
      .text(`Endereços Alocados (${nonFree.length})`, margin, dy);
    dy += 14;

    const ipCols = {
      address:    { x: margin,       w: 110, label: "Endereço IP" },
      status:     { x: margin + 110, w: 65,  label: "Status" },
      hostname:   { x: margin + 175, w: 115, label: "Hostname" },
      owner:      { x: margin + 290, w: 90,  label: "Proprietário" },
      equipment:  { x: margin + 380, w: 110, label: "Equipamento" },
    };

    doc.rect(margin, dy, contentW, 16).fill(COLORS.surface);
    Object.values(ipCols).forEach((col) => {
      doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(7)
        .text(col.label, col.x + 3, dy + 5, { width: col.w - 3 });
    });
    dy += 16;

    for (const addr of nonFree) {
      if (dy > pageH - 60) {
        doc.addPage();
        doc.rect(0, 0, pageW, pageH).fill(COLORS.bg);
        doc.rect(0, 0, 6, pageH).fill(COLORS.primary);
        dy = margin;
      }

      const rowBg2 = dy % 28 < 14 ? COLORS.bg : COLORS.surface;
      doc.rect(margin, dy, contentW, 13).fill(rowBg2);

      const ipRowData: Record<string, string> = {
        address:   addr.address,
        status:    STATUS_LABEL[addr.status] ?? addr.status,
        hostname:  addr.hostname ?? "—",
        owner:     addr.owner ?? "—",
        equipment: (addr as any).equipmentName ?? "—",
      };

      Object.entries(ipCols).forEach(([key, col]) => {
        const color = key === "status" ? statusColor(addr.status) : key === "address" ? COLORS.text : COLORS.muted;
        const font  = key === "address" || key === "hostname" ? "Courier" : "Helvetica";
        doc.fillColor(color).font(font).fontSize(7.5)
          .text(ipRowData[key], col.x + 3, dy + 3, { width: col.w - 3, ellipsis: true });
      });

      dy += 13;
    }
  }

  // ── Rodapé da última página ───────────────────────────────────────────────────
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8)
    .text(
      `FiberDoc — Relatório gerado automaticamente em ${dateStr} às ${timeStr}`,
      margin,
      pageH - 30,
      { width: contentW, align: "center" }
    );

  doc.end();
}
