import React from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Via = {
  id: number;
  tubeId: number;
  viaNumber: number;
  label: string | null;
  fusedToViaId: number | null;
  fusedToTubeId: number | null;
  notes: string | null;
  fiberId?: number | null;
};
type Tube = {
  id: number;
  type: "tube" | "splitter";
  identifier: string;
  totalVias: number;
  color: string | null;
  notes: string | null;
  bandejaId?: number | null;
};
type Bandeja = {
  id: number;
  ceoId: number;
  number: number;
  label: string | null;
  notes: string | null;
};
type Splitter = {
  id: number;
  ceoId: number;
  bandejaId: number | null;
  identifier: string;
  type: "balanced" | "unbalanced";
  ratio: string;
  notes: string | null;
};
type SplitterVia = {
  id: number;
  splitterId: number;
  ceoId: number;
  viaNumber: number;
  label: string | null;
  lossDb: number | null;
  notes: string | null;
};
type ViaAssociation = {
  id: number;
  ceoId: number;
  sourceType: "tube" | "splitter";
  sourceViaId: number;
  targetType: "tube" | "splitter";
  targetViaId: number;
  notes: string | null;
};
type Ceo = {
  id: number;
  name: string;
  location: string | null;
  notes: string | null;
  status: string;
};

// Mapeamento de cores ABNT para texto imprimível
const ABNT_COLOR_NAMES: Record<string, string> = {
  blue: "AZUL", orange: "LARANJA", green: "VERDE", brown: "MARROM", gray: "CINZA",
  white: "BRANCO", red: "VERMELHO", black: "PRETO", yellow: "AMARELO", violet: "VIOLETA",
  pink: "ROSA", aqua: "AQUA",
};

interface CeoFusionPrintProps {
  ceo: Ceo;
  tubes: Tube[];
  allVias: Via[];
  roomName?: string;
  bandejas?: Bandeja[];
  splitters?: Splitter[];
  allSplitterVias?: SplitterVia[];
  associations?: ViaAssociation[];
}

/**
 * Componente invisível no modo normal, visível apenas durante impressão.
 * Renderiza o mapa de fusões organizado por bandejas (quando disponível),
 * incluindo tubos, splitters com perdas estimadas, e associações de vias.
 */
export function CeoFusionPrint({
  ceo, tubes, allVias, roomName,
  bandejas = [], splitters = [], allSplitterVias = [], associations = [],
}: CeoFusionPrintProps) {
  // ── Lookup maps ────────────────────────────────────────────────────────────
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
  const splitterById: Record<number, Splitter> = {};
  for (const s of splitters) splitterById[s.id] = s;
  const splitterViasBySplitter: Record<number, SplitterVia[]> = {};
  for (const sv of allSplitterVias) {
    if (!splitterViasBySplitter[sv.splitterId]) splitterViasBySplitter[sv.splitterId] = [];
    splitterViasBySplitter[sv.splitterId].push(sv);
  }
  for (const key of Object.keys(splitterViasBySplitter)) {
    splitterViasBySplitter[Number(key)].sort((a, b) => a.viaNumber - b.viaNumber);
  }

  // ── Estatísticas globais ───────────────────────────────────────────────────
  const totalVias = tubes.reduce((s, t) => s + t.totalVias, 0);
  const fusedVias = allVias.filter(v => v.fusedToViaId !== null).length;
  const now = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  // ── Helpers de associação ──────────────────────────────────────────────────
  function getAssocLabel(assoc: ViaAssociation, myViaId: number, myType: "tube" | "splitter"): string {
    const isSrc = assoc.sourceType === myType && assoc.sourceViaId === myViaId;
    const otherViaId = isSrc ? assoc.targetViaId : assoc.sourceViaId;
    const otherType = isSrc ? assoc.targetType : assoc.sourceType;
    if (otherType === "tube") {
      const ov = viaById[otherViaId];
      const ot = ov ? tubeById[ov.tubeId] : null;
      if (ov && ot) return `VIA ${String(ov.viaNumber).padStart(2,"0")} · ${ot.identifier}`;
    } else {
      const sv = allSplitterVias.find(v => v.id === otherViaId);
      const sp = sv ? splitterById[sv.splitterId] : null;
      if (sv && sp) return `VIA ${String(sv.viaNumber).padStart(2,"0")} · ${sp.identifier}`;
    }
    return `Via #${otherViaId}`;
  }

  // ── Renderizar seção de tubo ──────────────────────────────────────────────
  function renderTubeSection(tube: Tube) {
    const vias = viasByTube[tube.id] ?? [];
    const fused = vias.filter(v => v.fusedToViaId !== null).length;
    const colorName = tube.color ? (ABNT_COLOR_NAMES[tube.color] ?? tube.color.toUpperCase()) : null;
    return (
      <div key={tube.id} className="tube-section">
        <div className="tube-title" style={{ background: "#e0f2fe", borderColor: "#0891b2" }}>
          ○ TUBO — {tube.identifier}
          {colorName && <span style={{ fontWeight: 400, fontSize: "7.5pt", marginLeft: "4mm", color: "#0c4a6e" }}>Cor: {colorName}</span>}
          <span style={{ fontWeight: 400, fontSize: "8pt", marginLeft: "6mm", color: "#6b7280" }}>
            {tube.totalVias} vias · {fused} fusionada{fused !== 1 ? "s" : ""}
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: "6%" }}>VIA</th>
              <th style={{ width: "18%" }}>ETIQUETA</th>
              <th style={{ width: "10%" }}>STATUS</th>
              <th style={{ width: "30%" }}>FUSÃO / ASSOCIAÇÃO</th>
              <th style={{ width: "36%" }}>OBSERVAÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: tube.totalVias }, (_, i) => i + 1).map(i => {
              const via = vias.find(v => v.viaNumber === i) ?? null;
              const fusedTube = via?.fusedToTubeId ? tubeById[via.fusedToTubeId] : null;
              const fusedVia = via?.fusedToViaId ? viaById[via.fusedToViaId] : null;
              const isFused = !!(fusedTube && fusedVia);
              const myAssocs = via ? associations.filter(a =>
                (a.sourceType === "tube" && a.sourceViaId === via.id) ||
                (a.targetType === "tube" && a.targetViaId === via.id)
              ) : [];
              return (
                <tr key={i} style={{ background: isFused ? "#f0fdfa" : myAssocs.length > 0 ? "#f0fdf4" : "transparent" }}>
                  <td style={{ textAlign: "center", fontWeight: 700, color: "#0c4a6e" }}>
                    {String(i).padStart(2, "0")}
                  </td>
                  <td>
                    {via?.label
                      ? <span style={{ fontWeight: 500 }}>{via.label}</span>
                      : <span className="empty-cell">—</span>}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {isFused ? (
                      <span style={{ background: "#cffafe", color: "#0891b2", padding: "1px 4px", borderRadius: "3px", fontSize: "6.5pt", fontWeight: 700 }}>FUSÃO</span>
                    ) : myAssocs.length > 0 ? (
                      <span style={{ background: "#dcfce7", color: "#166534", padding: "1px 4px", borderRadius: "3px", fontSize: "6.5pt", fontWeight: 700 }}>ASSOC</span>
                    ) : (
                      <span style={{ background: "#f3f4f6", color: "#9ca3af", padding: "1px 4px", borderRadius: "3px", fontSize: "6.5pt" }}>LIVRE</span>
                    )}
                  </td>
                  <td className={isFused ? "fused-cell" : myAssocs.length > 0 ? "" : "empty-cell"}>
                    {isFused && fusedVia && fusedTube
                      ? `VIA ${String(fusedVia.viaNumber).padStart(2,"0")} · ${fusedTube.identifier}${fusedVia.label ? ` (${fusedVia.label})` : ""}`
                      : myAssocs.length > 0 && via
                      ? myAssocs.map(a => getAssocLabel(a, via.id, "tube")).join(", ")
                      : "—"}
                  </td>
                  <td style={{ fontSize: "7.5pt", color: "#6b7280" }}>{via?.notes ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Renderizar seção de splitter ──────────────────────────────────────────
  function renderSplitterSection(splitter: Splitter) {
    const vias = splitterViasBySplitter[splitter.id] ?? [];
    const entrada = vias.find(v => v.viaNumber === 0);
    const saidas = vias.filter(v => v.viaNumber > 0);
    const typeLabel = splitter.type === "balanced" ? "Balanceado" : "Desbalanceado";
    return (
      <div key={`splitter-${splitter.id}`} className="tube-section">
        <div className="tube-title" style={{ background: "#fef3c7", borderColor: "#f59e0b" }}>
          ⊕ SPLITTER — {splitter.identifier}
          <span style={{ fontWeight: 400, fontSize: "7.5pt", marginLeft: "4mm", color: "#92400e" }}>
            {typeLabel} · {splitter.ratio}
          </span>
          <span style={{ fontWeight: 400, fontSize: "8pt", marginLeft: "6mm", color: "#6b7280" }}>
            {vias.length} vias (1 entrada + {saidas.length} saídas)
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: "6%" }}>VIA</th>
              <th style={{ width: "12%" }}>TIPO</th>
              <th style={{ width: "16%" }}>ETIQUETA</th>
              <th style={{ width: "10%" }}>PERDA (dB)</th>
              <th style={{ width: "28%" }}>ASSOCIAÇÃO</th>
              <th style={{ width: "28%" }}>OBSERVAÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {[...(entrada ? [entrada] : []), ...saidas].map(via => {
              const isEntrada = via.viaNumber === 0;
              const myAssocs = associations.filter(a =>
                (a.sourceType === "splitter" && a.sourceViaId === via.id) ||
                (a.targetType === "splitter" && a.targetViaId === via.id)
              );
              return (
                <tr key={via.id} style={{
                  background: isEntrada ? "#fefce8" : myAssocs.length > 0 ? "#f0fdf4" : "transparent",
                }}>
                  <td style={{ textAlign: "center", fontWeight: 700, color: isEntrada ? "#92400e" : "#374151" }}>
                    {isEntrada ? "00" : String(via.viaNumber).padStart(2, "0")}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    {isEntrada ? (
                      <span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 4px", borderRadius: "3px", fontSize: "6.5pt", fontWeight: 700 }}>ENTRADA</span>
                    ) : (
                      <span style={{ background: "#e0f2fe", color: "#0c4a6e", padding: "1px 4px", borderRadius: "3px", fontSize: "6.5pt" }}>SAÍDA</span>
                    )}
                  </td>
                  <td>
                    {via.label
                      ? <span style={{ fontWeight: 500 }}>{via.label}</span>
                      : <span className="empty-cell">—</span>}
                  </td>
                  <td style={{ textAlign: "center", color: "#6b7280", fontSize: "8pt" }}>
                    {isEntrada ? "0 dB" : via.lossDb !== null ? `~${via.lossDb} dB` : "—"}
                  </td>
                  <td className={myAssocs.length > 0 ? "" : "empty-cell"} style={{ fontSize: "7.5pt" }}>
                    {myAssocs.length > 0
                      ? myAssocs.map(a => getAssocLabel(a, via.id, "splitter")).join(", ")
                      : "—"}
                  </td>
                  <td style={{ fontSize: "7.5pt", color: "#6b7280" }}>{via.notes ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Renderizar seção de bandeja ───────────────────────────────────────────
  function renderBandejaSection(bandeja: Bandeja) {
    const bandejaTubes = tubes.filter(t => t.bandejaId === bandeja.id);
    const bandejaSplitters = splitters.filter(s => s.bandejaId === bandeja.id);
    const bandejaVias = allVias.filter(v => bandejaTubes.some(t => t.id === v.tubeId));
    const fusedCount = bandejaVias.filter(v => v.fusedToViaId !== null).length;
    const totalBandejaVias = bandejaTubes.reduce((s, t) => s + t.totalVias, 0);
    const splitterViasCount = bandejaSplitters.reduce((s, sp) => s + (splitterViasBySplitter[sp.id]?.length ?? 0), 0);

    return (
      <div key={`bandeja-${bandeja.id}`} style={{ marginBottom: "6mm" }}>
        {/* Cabeçalho da bandeja */}
        <div style={{
          background: "#1e293b", color: "#f8fafc",
          padding: "2.5mm 4mm", borderRadius: "3px 3px 0 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: "1mm",
        }}>
          <div>
            <span style={{ fontWeight: 800, fontSize: "10pt" }}>BANDEJA {bandeja.number}</span>
            {bandeja.label && (
              <span style={{ fontWeight: 400, fontSize: "9pt", marginLeft: "4mm", color: "#94a3b8" }}>
                — {bandeja.label}
              </span>
            )}
          </div>
          <div style={{ fontSize: "8pt", color: "#94a3b8", display: "flex", gap: "4mm" }}>
            <span>{bandejaTubes.length} tubo{bandejaTubes.length !== 1 ? "s" : ""}</span>
            <span>{bandejaSplitters.length} splitter{bandejaSplitters.length !== 1 ? "s" : ""}</span>
            <span>{totalBandejaVias + splitterViasCount} vias</span>
            <span style={{ color: fusedCount > 0 ? "#34d399" : "#64748b" }}>
              {fusedCount} fusionada{fusedCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        {bandeja.notes && (
          <div style={{ fontSize: "7.5pt", color: "#6b7280", fontStyle: "italic", marginBottom: "2mm", paddingLeft: "2mm" }}>
            {bandeja.notes}
          </div>
        )}
        {bandejaTubes.map(tube => renderTubeSection(tube))}
        {bandejaSplitters.map(splitter => renderSplitterSection(splitter))}
        {bandejaTubes.length === 0 && bandejaSplitters.length === 0 && (
          <div style={{ padding: "3mm", color: "#9ca3af", fontSize: "8pt", fontStyle: "italic", border: "1px dashed #e2e8f0", borderRadius: "3px" }}>
            Bandeja vazia
          </div>
        )}
      </div>
    );
  }

  // ── Organizar conteúdo ────────────────────────────────────────────────────
  const hasBandejas = bandejas.length > 0;
  const tubesWithoutBandeja = tubes.filter(t => !t.bandejaId);
  const splittersWithoutBandeja = splitters.filter(s => !s.bandejaId);

  // Montar pares de tubos para tubos sem bandeja (lógica legada)
  const pairedSet = new Set<number>();
  const pairs: { tubeA: Tube; tubeB: Tube }[] = [];
  for (let i = 0; i < tubesWithoutBandeja.length; i++) {
    const tubeA = tubesWithoutBandeja[i];
    if (pairedSet.has(tubeA.id)) continue;
    const partnerCount: Record<number, number> = {};
    for (const via of viasByTube[tubeA.id] ?? []) {
      if (via.fusedToTubeId && via.fusedToTubeId !== tubeA.id) {
        partnerCount[via.fusedToTubeId] = (partnerCount[via.fusedToTubeId] ?? 0) + 1;
      }
    }
    const candidateIds = Object.keys(partnerCount).map(Number)
      .filter(id => !pairedSet.has(id))
      .sort((a, b) => partnerCount[b] - partnerCount[a]);
    if (candidateIds.length > 0) {
      const tubeB = tubeById[candidateIds[0]];
      if (tubeB && !tubeB.bandejaId) {
        pairs.push({ tubeA, tubeB });
        pairedSet.add(tubeA.id);
        pairedSet.add(tubeB.id);
      }
    }
  }
  const soloTubes = tubesWithoutBandeja.filter(t => !pairedSet.has(t.id));

  // ── Renderizar par espelhado (para tubos sem bandeja) ─────────────────────
  function renderPair(tubeA: Tube, tubeB: Tube) {
    const viasA = viasByTube[tubeA.id] ?? [];
    const viasB = viasByTube[tubeB.id] ?? [];
    const maxVias = Math.max(tubeA.totalVias, tubeB.totalVias);
    const fusedA = viasA.filter(v => v.fusedToViaId !== null).length;
    const fusedB = viasB.filter(v => v.fusedToViaId !== null).length;
    const usedBIds = new Set<number>();
    const rows: { viaA: Via | null; viaB: Via | null; isFused: boolean }[] = [];
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
    const colorA = tubeA.color ? (ABNT_COLOR_NAMES[tubeA.color] ?? tubeA.color.toUpperCase()) : null;
    const colorB = tubeB.color ? (ABNT_COLOR_NAMES[tubeB.color] ?? tubeB.color.toUpperCase()) : null;
    return (
      <div key={`${tubeA.id}-${tubeB.id}`} className="tube-section">
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "4mm", marginBottom: "2mm", alignItems: "center" }}>
          <div style={{ background: "#e0f2fe", border: "1px solid #0891b2", borderRadius: "3px", padding: "2mm 3mm" }}>
            <div style={{ fontWeight: 800, fontSize: "9pt", color: "#0c4a6e" }}>○ TUBO — {tubeA.identifier}</div>
            <div style={{ fontSize: "7.5pt", color: "#6b7280", marginTop: "0.5mm" }}>
              {tubeA.totalVias} vias · {fusedA} fusionada{fusedA !== 1 ? "s" : ""}{colorA ? ` · ${colorA}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "center", fontSize: "14pt", fontWeight: 900, color: "#0891b2", padding: "0 2mm" }}>↔</div>
          <div style={{ background: "#e0f2fe", border: "1px solid #0891b2", borderRadius: "3px", padding: "2mm 3mm" }}>
            <div style={{ fontWeight: 800, fontSize: "9pt", color: "#0c4a6e" }}>○ TUBO — {tubeB.identifier}</div>
            <div style={{ fontSize: "7.5pt", color: "#6b7280", marginTop: "0.5mm" }}>
              {tubeB.totalVias} vias · {fusedB} fusionada{fusedB !== 1 ? "s" : ""}{colorB ? ` · ${colorB}` : ""}
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: "7%", textAlign: "center", background: "#e0f2fe", color: "#0c4a6e" }}>VIA</th>
              <th style={{ width: "20%", background: "#e0f2fe", color: "#0c4a6e" }}>ETIQUETA ({tubeA.identifier})</th>
              <th style={{ width: "6%", textAlign: "center", background: "#f0fdf4", color: "#166534" }}>↔</th>
              <th style={{ width: "20%", background: "#e0f2fe", color: "#0c4a6e" }}>ETIQUETA ({tubeB.identifier})</th>
              <th style={{ width: "7%", textAlign: "center", background: "#e0f2fe", color: "#0c4a6e" }}>VIA</th>
              <th style={{ width: "40%" }}>OBSERVAÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const { viaA, viaB, isFused } = row;
              const emptyStyle: React.CSSProperties = { color: "#d1d5db", textAlign: "center" };
              return (
                <tr key={idx} style={{ background: isFused ? "#f0fdfa" : "transparent" }}>
                  <td style={{ textAlign: "center", fontWeight: 700, color: viaA ? "#0c4a6e" : "#d1d5db" }}>
                    {viaA ? String(viaA.viaNumber).padStart(2,"0") : "—"}
                  </td>
                  <td>{viaA?.label ? <span style={{ fontWeight: 500 }}>{viaA.label}</span> : <span style={emptyStyle}>—</span>}</td>
                  <td style={{ textAlign: "center" }}>
                    {isFused
                      ? <span style={{ color: "#059669", fontWeight: 900, fontSize: "10pt" }}>↔</span>
                      : <span style={{ color: "#e5e7eb" }}>·</span>}
                  </td>
                  <td>{viaB?.label ? <span style={{ fontWeight: 500 }}>{viaB.label}</span> : <span style={emptyStyle}>—</span>}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: viaB ? "#0c4a6e" : "#d1d5db" }}>
                    {viaB ? String(viaB.viaNumber).padStart(2,"0") : "—"}
                  </td>
                  <td style={{ fontSize: "7.5pt", color: "#6b7280" }}>
                    {[viaA?.notes, viaB?.notes].filter(Boolean).join(" | ") || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div id="ceo-fusion-print" style={{ display: "none" }}>
      <div className="print-page">
        {/* ── Cabeçalho ── */}
        <div className="print-header">
          <div>
            <div style={{ fontSize: "16pt", fontWeight: 800, color: "#1a1a2e", marginBottom: "2mm" }}>
              MAPA DE FUSÕES E BANDEJAS — CEO
            </div>
            <div style={{ fontSize: "14pt", fontWeight: 700, color: "#0891b2" }}>{ceo.name}</div>
            {ceo.location && <div style={{ fontSize: "9pt", color: "#6b7280", marginTop: "1mm" }}>📍 {ceo.location}</div>}
            {roomName && <div style={{ fontSize: "9pt", color: "#6b7280" }}>🏢 {roomName}</div>}
            {ceo.notes && <div style={{ fontSize: "8pt", color: "#9ca3af", marginTop: "1mm", fontStyle: "italic" }}>{ceo.notes}</div>}
          </div>
          <div style={{ textAlign: "right", fontSize: "8pt", color: "#6b7280" }}>
            <div style={{ fontWeight: 700, fontSize: "9pt", color: "#1a1a2e", marginBottom: "1mm" }}>FiberDoc</div>
            <div>Gerado em: {now}</div>
            <div style={{ marginTop: "1mm" }}>
              Status:{" "}
              <span style={{ fontWeight: 600, color: ceo.status === "active" ? "#059669" : "#d97706" }}>
                {ceo.status === "active" ? "Ativo" : ceo.status === "maintenance" ? "Manutenção" : "Inativo"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Estatísticas ── */}
        <div className="stats-row">
          {[
            { label: "Bandejas", value: bandejas.length },
            { label: "Tubos", value: tubes.length },
            { label: "Splitters", value: splitters.length },
            { label: "Total de Vias", value: totalVias },
            { label: "Vias Fusionadas", value: fusedVias },
            { label: "Ocupação", value: `${totalVias > 0 ? Math.round((fusedVias / totalVias) * 100) : 0}%` },
          ].map(stat => (
            <div key={stat.label} className="stat-box">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ── Índice por bandejas ── */}
        {hasBandejas && (
          <div style={{ marginBottom: "4mm", padding: "2mm 3mm", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "3px" }}>
            <div style={{ fontWeight: 700, fontSize: "8pt", color: "#374151", marginBottom: "2mm" }}>ÍNDICE DE BANDEJAS</div>
            {bandejas.sort((a, b) => a.number - b.number).map(b => {
              const bTubes = tubes.filter(t => t.bandejaId === b.id);
              const bSplitters = splitters.filter(s => s.bandejaId === b.id);
              return (
                <div key={b.id} style={{ marginBottom: "1.5mm" }}>
                  <span style={{ fontWeight: 700, fontSize: "8pt", color: "#1e293b" }}>
                    Bandeja {b.number}{b.label ? ` — ${b.label}` : ""}:
                  </span>
                  <span style={{ fontSize: "7.5pt", color: "#6b7280", marginLeft: "2mm" }}>
                    {[...bTubes.map(t => t.identifier), ...bSplitters.map(s => s.identifier)].join(", ") || "vazia"}
                  </span>
                </div>
              );
            })}
            {(tubesWithoutBandeja.length > 0 || splittersWithoutBandeja.length > 0) && (
              <div style={{ marginTop: "1.5mm" }}>
                <span style={{ fontWeight: 700, fontSize: "8pt", color: "#6b7280" }}>Sem bandeja:</span>
                <span style={{ fontSize: "7.5pt", color: "#9ca3af", marginLeft: "2mm" }}>
                  {[...tubesWithoutBandeja, ...splittersWithoutBandeja].map(t => t.identifier).join(", ")}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Índice simples (sem bandejas) ── */}
        {!hasBandejas && (
          <div style={{ marginBottom: "4mm", padding: "2mm 3mm", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "3px" }}>
            <div style={{ fontWeight: 700, fontSize: "8pt", color: "#374151", marginBottom: "1.5mm" }}>ÍNDICE DE TUBOS / SPLITTERS</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2mm" }}>
              {tubes.map(t => {
                const vias = viasByTube[t.id] ?? [];
                const fused = vias.filter(v => v.fusedToViaId !== null).length;
                return (
                  <div key={t.id} style={{
                    display: "flex", alignItems: "center", gap: "1.5mm",
                    padding: "1mm 2.5mm",
                    background: t.type === "splitter" ? "#fef3c7" : "#e0f2fe",
                    border: `1px solid ${t.type === "splitter" ? "#f59e0b" : "#7dd3fc"}`,
                    borderRadius: "3px", fontSize: "7.5pt",
                  }}>
                    <span style={{ fontWeight: 700, color: t.type === "splitter" ? "#92400e" : "#0c4a6e" }}>{t.identifier}</span>
                    <span style={{ color: "#6b7280" }}>{fused}/{t.totalVias} vias</span>
                    <span style={{
                      background: fused === t.totalVias && t.totalVias > 0 ? "#d1fae5" : fused > 0 ? "#fef3c7" : "#f3f4f6",
                      color: fused === t.totalVias && t.totalVias > 0 ? "#065f46" : fused > 0 ? "#92400e" : "#6b7280",
                      padding: "0 3px", borderRadius: "2px", fontSize: "6.5pt", fontWeight: 700,
                    }}>
                      {fused === t.totalVias && t.totalVias > 0 ? "CHEIO" : fused > 0 ? "PARCIAL" : "LIVRE"}
                    </span>
                  </div>
                );
              })}
              {splitters.map(s => (
                <div key={`s-${s.id}`} style={{
                  display: "flex", alignItems: "center", gap: "1.5mm",
                  padding: "1mm 2.5mm", background: "#fef3c7", border: "1px solid #f59e0b",
                  borderRadius: "3px", fontSize: "7.5pt",
                }}>
                  <span style={{ fontWeight: 700, color: "#92400e" }}>{s.identifier}</span>
                  <span style={{ color: "#6b7280" }}>{s.ratio}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Conteúdo: organizado por bandejas ── */}
        {hasBandejas && (
          <>
            {bandejas.sort((a, b) => a.number - b.number).map(b => renderBandejaSection(b))}
            {(tubesWithoutBandeja.length > 0 || splittersWithoutBandeja.length > 0) && (
              <div style={{ marginBottom: "6mm" }}>
                <div style={{
                  background: "#475569", color: "#f8fafc",
                  padding: "2.5mm 4mm", borderRadius: "3px 3px 0 0",
                  fontWeight: 800, fontSize: "10pt", marginBottom: "1mm",
                }}>
                  SEM BANDEJA
                </div>
                {pairs.map(p => renderPair(p.tubeA, p.tubeB))}
                {soloTubes.map(t => renderTubeSection(t))}
                {splittersWithoutBandeja.map(s => renderSplitterSection(s))}
              </div>
            )}
          </>
        )}

        {/* ── Conteúdo: modo legado (sem bandejas) ── */}
        {!hasBandejas && (
          <>
            {pairs.map(p => renderPair(p.tubeA, p.tubeB))}
            {soloTubes.map(t => renderTubeSection(t))}
            {splitters.map(s => renderSplitterSection(s))}
          </>
        )}

        {/* ── Rodapé ── */}
        <div className="print-footer">
          <span>FiberDoc — Sistema de Gestão de Infraestrutura de Rede Óptica</span>
          <span>{ceo.name} · {now}</span>
        </div>
      </div>
    </div>
  );
}
