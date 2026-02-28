import React from "react";

type Via = {
  id: number;
  tubeId: number;
  ctoId: number;
  viaNumber: number;
  label: string | null;
  fusedToViaId: number | null;
  fusedToTubeId: number | null;
  notes: string | null;
};

type Tube = {
  id: number;
  type: "tube" | "splitter";
  identifier: string;
  totalVias: number;
  color: string | null;
  notes: string | null;
};

type Cto = {
  id: number;
  name: string;
  address: string | null;
  capacity: number | null;
  status: string;
  notes?: string | null;
};

interface CtoFusionPrintProps {
  cto: Cto;
  tubes: Tube[];
  allVias: Via[];
}

/**
 * Componente invisível no modo normal, visível apenas durante impressão.
 * Renderiza o mapa de fusões da CTO em layout espelhado (TUBO A ↔ TUBO B).
 */
export function CtoFusionPrint({ cto, tubes, allVias }: CtoFusionPrintProps) {
  const viasByTube: Record<number, Via[]> = {};
  for (const via of allVias) {
    if (!viasByTube[via.tubeId]) viasByTube[via.tubeId] = [];
    viasByTube[via.tubeId].push(via);
  }
  for (const key of Object.keys(viasByTube)) {
    viasByTube[Number(key)].sort((a, b) => a.viaNumber - b.viaNumber);
  }

  const viaById: Record<number, Via> = {};
  for (const via of allVias) viaById[via.id] = via;

  const tubeById: Record<number, Tube> = {};
  for (const tube of tubes) tubeById[tube.id] = tube;

  const totalVias = tubes.reduce((s, t) => s + t.totalVias, 0);
  const fusedVias = allVias.filter(v => v.fusedToViaId !== null).length;
  const now = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const pairedSet = new Set<number>();
  const pairs: { tubeA: Tube; tubeB: Tube }[] = [];

  for (let i = 0; i < tubes.length; i++) {
    const tubeA = tubes[i];
    if (pairedSet.has(tubeA.id)) continue;
    const partnerCount: Record<number, number> = {};
    for (const via of viasByTube[tubeA.id] ?? []) {
      if (via.fusedToTubeId && via.fusedToTubeId !== tubeA.id) {
        partnerCount[via.fusedToTubeId] = (partnerCount[via.fusedToTubeId] ?? 0) + 1;
      }
    }
    const candidateIds = Object.keys(partnerCount)
      .map(Number)
      .filter(id => !pairedSet.has(id))
      .sort((a, b) => partnerCount[b] - partnerCount[a]);
    if (candidateIds.length > 0) {
      const tubeB = tubeById[candidateIds[0]];
      if (tubeB) {
        pairs.push({ tubeA, tubeB });
        pairedSet.add(tubeA.id);
        pairedSet.add(tubeB.id);
      }
    }
  }

  const soloTubes = tubes.filter(t => !pairedSet.has(t.id));
  const indexEntries = tubes.map(t => {
    const vias = viasByTube[t.id] ?? [];
    const fused = vias.filter(v => v.fusedToViaId !== null).length;
    return { tube: t, fused, total: t.totalVias };
  });

  function renderPair(tubeA: Tube, tubeB: Tube) {
    const viasA = viasByTube[tubeA.id] ?? [];
    const viasB = viasByTube[tubeB.id] ?? [];
    const maxVias = Math.max(tubeA.totalVias, tubeB.totalVias);
    const fusedA = viasA.filter(v => v.fusedToViaId !== null).length;
    const fusedB = viasB.filter(v => v.fusedToViaId !== null).length;

    const rows: { viaA: Via | null; viaB: Via | null; isFused: boolean }[] = [];
    const usedBIds = new Set<number>();

    for (let i = 1; i <= maxVias; i++) {
      const vA = viasA.find(v => v.viaNumber === i) ?? null;
      let vB: Via | null = null;
      let fused = false;
      if (vA && vA.fusedToViaId && vA.fusedToTubeId === tubeB.id) {
        vB = viaById[vA.fusedToViaId] ?? null;
        if (vB) { usedBIds.add(vB.id); fused = true; }
      }
      rows.push({ viaA: vA, viaB: vB, isFused: fused });
    }
    for (const vB of viasB) {
      if (!usedBIds.has(vB.id)) rows.push({ viaA: null, viaB: vB, isFused: false });
    }

    return (
      <div key={`${tubeA.id}-${tubeB.id}`} className="tube-section">
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "4mm", marginBottom: "2mm", alignItems: "center" }}>
          <div style={{ background: tubeA.type === "splitter" ? "#fef3c7" : "#e0f2fe", border: `1px solid ${tubeA.type === "splitter" ? "#f59e0b" : "#0891b2"}`, borderRadius: "3px", padding: "2mm 3mm" }}>
            <div style={{ fontWeight: 800, fontSize: "9pt", color: tubeA.type === "splitter" ? "#92400e" : "#0c4a6e" }}>
              {tubeA.type === "splitter" ? "⊕ SPLITTER" : "○ TUBO"} — {tubeA.identifier}
            </div>
            <div style={{ fontSize: "7.5pt", color: "#6b7280", marginTop: "0.5mm" }}>
              {tubeA.totalVias} vias · {fusedA} fusionada{fusedA !== 1 ? "s" : ""}{tubeA.color ? ` · ${tubeA.color}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: "14pt", fontWeight: 900, color: "#059669", padding: "0 2mm" }}>↔</div>
          <div style={{ background: tubeB.type === "splitter" ? "#fef3c7" : "#e0f2fe", border: `1px solid ${tubeB.type === "splitter" ? "#f59e0b" : "#0891b2"}`, borderRadius: "3px", padding: "2mm 3mm" }}>
            <div style={{ fontWeight: 800, fontSize: "9pt", color: tubeB.type === "splitter" ? "#92400e" : "#0c4a6e" }}>
              {tubeB.type === "splitter" ? "⊕ SPLITTER" : "○ TUBO"} — {tubeB.identifier}
            </div>
            <div style={{ fontSize: "7.5pt", color: "#6b7280", marginTop: "0.5mm" }}>
              {tubeB.totalVias} vias · {fusedB} fusionada{fusedB !== 1 ? "s" : ""}{tubeB.color ? ` · ${tubeB.color}` : ""}
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: "7%", textAlign: "center", background: "#d1fae5", color: "#065f46" }}>VIA</th>
              <th style={{ width: "20%", background: "#d1fae5", color: "#065f46" }}>ETIQUETA ({tubeA.identifier})</th>
              <th style={{ width: "6%", textAlign: "center", background: "#f0fdf4", color: "#166534" }}>↔</th>
              <th style={{ width: "20%", background: "#d1fae5", color: "#065f46" }}>ETIQUETA ({tubeB.identifier})</th>
              <th style={{ width: "7%", textAlign: "center", background: "#d1fae5", color: "#065f46" }}>VIA</th>
              <th style={{ width: "40%" }}>OBSERVAÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const { viaA, viaB, isFused } = row;
              const rowBg = isFused ? "#f0fdfa" : "transparent";
              const emptyStyle: React.CSSProperties = { color: "#d1d5db", textAlign: "center" };
              return (
                <tr key={idx} style={{ background: rowBg }}>
                  <td style={{ textAlign: "center", fontWeight: 700, color: viaA ? "#065f46" : "#d1d5db" }}>{viaA ? viaA.viaNumber : "—"}</td>
                  <td>{viaA?.label ? <span style={{ fontWeight: 500 }}>{viaA.label}</span> : <span style={emptyStyle}>—</span>}</td>
                  <td style={{ textAlign: "center" }}>
                    {isFused ? <span style={{ color: "#059669", fontWeight: 900, fontSize: "10pt" }}>↔</span> : <span style={{ color: "#e5e7eb" }}>·</span>}
                  </td>
                  <td>{viaB?.label ? <span style={{ fontWeight: 500 }}>{viaB.label}</span> : <span style={emptyStyle}>—</span>}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: viaB ? "#065f46" : "#d1d5db" }}>{viaB ? viaB.viaNumber : "—"}</td>
                  <td style={{ fontSize: "7.5pt", color: "#6b7280" }}>{[viaA?.notes, viaB?.notes].filter(Boolean).join(" | ") || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderSolo(tube: Tube) {
    const vias = viasByTube[tube.id] ?? [];
    const fused = vias.filter(v => v.fusedToViaId !== null).length;
    return (
      <div key={tube.id} className="tube-section">
        <div className={`tube-title ${tube.type === "splitter" ? "splitter-title" : ""}`}>
          {tube.type === "splitter" ? "⊕ SPLITTER" : "○ TUBO"} — {tube.identifier}
          <span style={{ fontWeight: 400, fontSize: "8pt", marginLeft: "6mm", color: "#6b7280" }}>
            {tube.totalVias} vias · {fused} fusionada{fused !== 1 ? "s" : ""}
            {tube.color ? ` · ${tube.color}` : ""}
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: "8%" }}>VIA</th>
              <th style={{ width: "20%" }}>ETIQUETA</th>
              <th style={{ width: "12%" }}>STATUS</th>
              <th style={{ width: "35%" }}>IDENT. FUSÃO</th>
              <th style={{ width: "25%" }}>OBSERVAÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {vias.map(via => {
              const fusedTube = via.fusedToTubeId ? tubeById[via.fusedToTubeId] : null;
              const fusedVia = via.fusedToViaId ? viaById[via.fusedToViaId] : null;
              const isFused = !!(fusedTube && fusedVia);
              return (
                <tr key={via.id}>
                  <td style={{ textAlign: "center", fontWeight: 700 }}>{via.viaNumber}</td>
                  <td>{via.label ? <span style={{ fontWeight: 500 }}>{via.label}</span> : <span className="empty-cell">—</span>}</td>
                  <td style={{ textAlign: "center" }}>
                    {isFused
                      ? <span style={{ background: "#d1fae5", color: "#059669", padding: "1px 5px", borderRadius: "3px", fontSize: "7pt", fontWeight: 700 }}>FUSIONADA</span>
                      : <span style={{ background: "#f3f4f6", color: "#9ca3af", padding: "1px 5px", borderRadius: "3px", fontSize: "7pt" }}>LIVRE</span>}
                  </td>
                  <td className={isFused ? "fused-cell" : "empty-cell"}>
                    {isFused ? `VIA ${fusedVia!.viaNumber} do ${fusedTube!.identifier}${fusedVia!.label ? ` (${fusedVia!.label})` : ""}` : "—"}
                  </td>
                  <td style={{ fontSize: "8pt", color: "#6b7280" }}>{via.notes ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  type PageItem = { kind: "pair"; tubeA: Tube; tubeB: Tube } | { kind: "solo"; tube: Tube };
  const items: PageItem[] = [
    ...pairs.map(p => ({ kind: "pair" as const, ...p })),
    ...soloTubes.map(t => ({ kind: "solo" as const, tube: t })),
  ];
  const ITEMS_PER_PAGE = 2;
  const pages: PageItem[][] = [];
  for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) pages.push(items.slice(i, i + ITEMS_PER_PAGE));
  if (pages.length === 0) pages.push([]);

  return (
    <div id="cto-fusion-print" style={{ display: "none" }}>
      {pages.map((pageItems, pageIdx) => (
        <div key={pageIdx} className="print-page">
          {pageIdx === 0 && (
            <>
              <div className="print-header">
                <div>
                  <div style={{ fontSize: "16pt", fontWeight: 800, color: "#1a1a2e", marginBottom: "2mm" }}>MAPA DE FUSÕES — CTO</div>
                  <div style={{ fontSize: "14pt", fontWeight: 700, color: "#059669" }}>{cto.name}</div>
                  {cto.address && <div style={{ fontSize: "9pt", color: "#6b7280", marginTop: "1mm" }}>📍 {cto.address}</div>}
                  {cto.capacity && <div style={{ fontSize: "9pt", color: "#6b7280" }}>Capacidade: {cto.capacity} portas</div>}
                  {cto.notes && <div style={{ fontSize: "8pt", color: "#9ca3af", marginTop: "1mm", fontStyle: "italic" }}>{cto.notes}</div>}
                </div>
                <div style={{ textAlign: "right", fontSize: "8pt", color: "#6b7280" }}>
                  <div style={{ fontWeight: 700, fontSize: "9pt", color: "#1a1a2e", marginBottom: "1mm" }}>FiberDoc</div>
                  <div>Gerado em: {now}</div>
                  <div style={{ marginTop: "1mm" }}>
                    Status: <span style={{ fontWeight: 600, color: cto.status === "active" ? "#059669" : "#d97706" }}>
                      {cto.status === "active" ? "Ativo" : cto.status === "maintenance" ? "Manutenção" : "Inativo"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="stats-row">
                {[
                  { label: "Tubos", value: tubes.filter(t => t.type === "tube").length },
                  { label: "Splitters", value: tubes.filter(t => t.type === "splitter").length },
                  { label: "Total de Vias", value: totalVias },
                  { label: "Vias Fusionadas", value: fusedVias },
                  { label: "Vias Livres", value: totalVias - fusedVias },
                  { label: "Ocupação", value: `${totalVias > 0 ? Math.round((fusedVias / totalVias) * 100) : 0}%` },
                ].map(stat => (
                  <div key={stat.label} className="stat-box">
                    <div className="stat-value">{stat.value}</div>
                    <div className="stat-label">{stat.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: "4mm", padding: "2mm 3mm", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "3px" }}>
                <div style={{ fontWeight: 700, fontSize: "8pt", color: "#374151", marginBottom: "1.5mm" }}>ÍNDICE DE TUBOS / SPLITTERS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "2mm" }}>
                  {indexEntries.map(({ tube, fused, total }) => (
                    <div key={tube.id} style={{ display: "flex", alignItems: "center", gap: "1.5mm", padding: "1mm 2.5mm", background: tube.type === "splitter" ? "#fef3c7" : "#d1fae5", border: `1px solid ${tube.type === "splitter" ? "#f59e0b" : "#6ee7b7"}`, borderRadius: "3px", fontSize: "7.5pt" }}>
                      <span style={{ fontWeight: 700, color: tube.type === "splitter" ? "#92400e" : "#065f46" }}>{tube.identifier}</span>
                      <span style={{ color: "#6b7280" }}>{fused}/{total} vias</span>
                      <span style={{ background: fused === total ? "#d1fae5" : fused > 0 ? "#fef3c7" : "#f3f4f6", color: fused === total ? "#065f46" : fused > 0 ? "#92400e" : "#6b7280", padding: "0 3px", borderRadius: "2px", fontSize: "6.5pt", fontWeight: 700 }}>
                        {fused === total ? "CHEIO" : fused > 0 ? "PARCIAL" : "LIVRE"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {pageItems.map((item, itemIdx) =>
            item.kind === "pair"
              ? <div key={itemIdx}>{renderPair(item.tubeA, item.tubeB)}</div>
              : <div key={itemIdx}>{renderSolo(item.tube)}</div>
          )}
          <div className="print-footer">
            <span>FiberDoc — Sistema de Gestão de Infraestrutura de Rede Óptica</span>
            <span>{cto.name} · Pág. {pageIdx + 1}/{pages.length} · {now}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
