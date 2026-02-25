import { useEffect, useRef } from "react";

type Via = {
  id: number;
  tubeId: number;
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

type Ceo = {
  id: number;
  name: string;
  location: string | null;
  notes: string | null;
  status: string;
};

interface CeoFusionPrintProps {
  ceo: Ceo;
  tubes: Tube[];
  allVias: Via[];
  roomName?: string;
}

/**
 * Componente invisível no modo normal, visível apenas durante impressão.
 * Renderiza o mapa completo de fusões da CEO em formato A4.
 */
export function CeoFusionPrint({ ceo, tubes, allVias, roomName }: CeoFusionPrintProps) {
  // Mapa: tubeId → vias
  const viasByTube: Record<number, Via[]> = {};
  for (const via of allVias) {
    if (!viasByTube[via.tubeId]) viasByTube[via.tubeId] = [];
    viasByTube[via.tubeId].push(via);
  }
  for (const key of Object.keys(viasByTube)) {
    viasByTube[Number(key)].sort((a, b) => a.viaNumber - b.viaNumber);
  }

  // Mapa: viaId → via (para lookup de fusão)
  const viaById: Record<number, Via> = {};
  for (const via of allVias) viaById[via.id] = via;

  // Mapa: tubeId → tube
  const tubeById: Record<number, Tube> = {};
  for (const tube of tubes) tubeById[tube.id] = tube;

  const totalVias = tubes.reduce((s, t) => s + t.totalVias, 0);
  const fusedVias = allVias.filter(v => v.fusedToViaId !== null).length;
  const now = new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  // Dividir tubos em páginas de até 3 tubos por página
  const TUBES_PER_PAGE = 3;
  const pages: Tube[][] = [];
  for (let i = 0; i < tubes.length; i += TUBES_PER_PAGE) {
    pages.push(tubes.slice(i, i + TUBES_PER_PAGE));
  }

  return (
    <div id="ceo-fusion-print" style={{ display: "none" }}>
      {pages.map((pageTubes, pageIdx) => (
        <div key={pageIdx} className="print-page">
          {/* Cabeçalho — apenas na primeira página */}
          {pageIdx === 0 && (
            <>
              <div className="print-header">
                <div>
                  <div style={{ fontSize: "16pt", fontWeight: 800, color: "#1a1a2e", marginBottom: "2mm" }}>
                    MAPA DE FUSÕES — CEO
                  </div>
                  <div style={{ fontSize: "14pt", fontWeight: 700, color: "#0891b2" }}>{ceo.name}</div>
                  {ceo.location && (
                    <div style={{ fontSize: "9pt", color: "#6b7280", marginTop: "1mm" }}>
                      📍 {ceo.location}
                    </div>
                  )}
                  {roomName && (
                    <div style={{ fontSize: "9pt", color: "#6b7280" }}>
                      🏢 {roomName}
                    </div>
                  )}
                  {ceo.notes && (
                    <div style={{ fontSize: "8pt", color: "#9ca3af", marginTop: "1mm", fontStyle: "italic" }}>
                      {ceo.notes}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", fontSize: "8pt", color: "#6b7280" }}>
                  <div style={{ fontWeight: 700, fontSize: "9pt", color: "#1a1a2e", marginBottom: "1mm" }}>FiberDoc</div>
                  <div>Gerado em: {now}</div>
                  <div style={{ marginTop: "1mm" }}>
                    Status: <span style={{ fontWeight: 600, color: ceo.status === "active" ? "#059669" : "#d97706" }}>
                      {ceo.status === "active" ? "Ativo" : ceo.status === "maintenance" ? "Manutenção" : "Inativo"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Estatísticas */}
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
            </>
          )}

          {/* Tubos desta página */}
          {pageTubes.map(tube => {
            const vias = viasByTube[tube.id] ?? [];
            const tubeFused = vias.filter(v => v.fusedToViaId !== null).length;

            return (
              <div key={tube.id} className="tube-section">
                <div className={`tube-title ${tube.type === "splitter" ? "splitter-title" : ""}`}>
                  {tube.type === "splitter" ? "⊕ SPLITTER" : "○ TUBO"} — {tube.identifier}
                  <span style={{ fontWeight: 400, fontSize: "8pt", marginLeft: "6mm", color: "#6b7280" }}>
                    {tube.totalVias} vias · {tubeFused} fusionada{tubeFused !== 1 ? "s" : ""}
                    {tube.color ? ` · Cor: ${tube.color}` : ""}
                  </span>
                </div>

                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "8%" }}>VIA</th>
                      <th style={{ width: "18%" }}>ETIQUETA</th>
                      <th style={{ width: "12%" }}>STATUS</th>
                      <th style={{ width: "32%" }}>IDENT. FUSÃO</th>
                      <th style={{ width: "30%" }}>OBSERVAÇÕES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vias.map(via => {
                      const fusedTube = via.fusedToTubeId ? tubeById[via.fusedToTubeId] : null;
                      const fusedVia = via.fusedToViaId ? viaById[via.fusedToViaId] : null;
                      const isFused = fusedTube && fusedVia;

                      return (
                        <tr key={via.id}>
                          <td style={{ textAlign: "center", fontWeight: 700 }}>
                            {via.viaNumber}
                          </td>
                          <td>
                            {via.label ? (
                              <span style={{ fontWeight: 500 }}>{via.label}</span>
                            ) : (
                              <span className="empty-cell">—</span>
                            )}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {isFused ? (
                              <span style={{
                                background: "#cffafe",
                                color: "#0891b2",
                                padding: "1px 6px",
                                borderRadius: "3px",
                                fontSize: "7pt",
                                fontWeight: 700,
                              }}>
                                FUSIONADA
                              </span>
                            ) : (
                              <span style={{
                                background: "#f3f4f6",
                                color: "#9ca3af",
                                padding: "1px 6px",
                                borderRadius: "3px",
                                fontSize: "7pt",
                              }}>
                                LIVRE
                              </span>
                            )}
                          </td>
                          <td className={isFused ? "fused-cell" : "empty-cell"}>
                            {isFused
                              ? `VIA ${fusedVia.viaNumber} do ${fusedTube.identifier}${fusedVia.label ? ` (${fusedVia.label})` : ""}`
                              : "—"}
                          </td>
                          <td style={{ fontSize: "8pt", color: "#6b7280" }}>
                            {via.notes ?? ""}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* Rodapé */}
          <div className="print-footer">
            <span>FiberDoc — Sistema de Gestão de Infraestrutura de Rede Óptica</span>
            <span>
              {ceo.name} · Pág. {pageIdx + 1}/{pages.length} · {now}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
