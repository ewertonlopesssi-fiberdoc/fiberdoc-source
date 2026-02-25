import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Network, ZoomIn, ZoomOut, RotateCcw, Server, Info } from "lucide-react";

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

const EQUIPMENT_COLORS: Record<string, string> = {
  switch: "#3b82f6",
  olt: "#22c55e",
  dgo: "#f97316",
  splitter: "#8b5cf6",
  router: "#06b6d4",
  server: "#ec4899",
  patch_panel: "#eab308",
  amplifier: "#ef4444",
  other: "#64748b",
};

type Node = {
  id: number;
  name: string;
  type: string;
  model: string | null;
  status: string;
  rack: string | null;
  roomName: string | null;
  x: number;
  y: number;
};

type Edge = {
  id: number;
  name: string | null;
  status: string;
  type: string;
  sourceEquipmentId: number | undefined;
  targetEquipmentId: number | undefined;
  sourcePortId: number;
  targetPortId: number;
};

function layoutNodes(nodes: Omit<Node, "x" | "y">[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return [];

  const centerX = 500;
  const centerY = 350;
  const radius = Math.min(280, Math.max(120, nodes.length * 35));

  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return {
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
}

export default function Topology() {
  const { data, isLoading } = trpc.topology.data.useQuery();
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const nodes: Node[] = layoutNodes(data?.nodes ?? [], data?.edges ?? []);
  const edges: Edge[] = (data?.edges ?? []).filter(
    (e) => e.sourceEquipmentId && e.targetEquipmentId && e.sourceEquipmentId !== e.targetEquipmentId
  );

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(3, Math.max(0.3, z * delta)));
  }

  function handleMouseDown(e: React.MouseEvent) {
    if ((e.target as SVGElement).closest(".node-group")) return;
    setDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }

  function handleMouseUp() {
    setDragging(false);
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-[600px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Topologia de Rede</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Diagrama visual de equipamentos e conexões
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 border-border/50" onClick={() => setZoom((z) => Math.min(3, z * 1.2))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 border-border/50" onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 border-border/50" onClick={resetView}>
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* SVG Topology */}
        <div className="lg:col-span-3">
          <Card className="border-border/50 bg-card overflow-hidden">
            <CardContent className="p-0">
              {nodes.length === 0 ? (
                <div className="h-[560px] flex flex-col items-center justify-center text-muted-foreground">
                  <Network className="h-16 w-16 mb-4 opacity-20" />
                  <p className="font-medium">Nenhum equipamento cadastrado</p>
                  <p className="text-sm opacity-60 mt-1">Cadastre equipamentos para visualizar a topologia</p>
                </div>
              ) : (
                <svg
                  ref={svgRef}
                  width="100%"
                  height="560"
                  viewBox="0 0 1000 700"
                  className="cursor-grab active:cursor-grabbing select-none"
                  style={{ background: "transparent" }}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  <defs>
                    <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                      <polygon points="0 0, 8 3, 0 6" fill="oklch(0.65 0.18 210 / 0.6)" />
                    </marker>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                    {/* Edges */}
                    {edges.map((edge) => {
                      const src = nodeMap.get(edge.sourceEquipmentId!);
                      const tgt = nodeMap.get(edge.targetEquipmentId!);
                      if (!src || !tgt) return null;
                      const isActive = edge.status === "active";
                      return (
                        <line
                          key={edge.id}
                          x1={src.x}
                          y1={src.y}
                          x2={tgt.x}
                          y2={tgt.y}
                          stroke={isActive ? "oklch(0.65 0.18 210 / 0.5)" : "oklch(0.55 0.02 240 / 0.4)"}
                          strokeWidth={isActive ? 1.5 : 1}
                          strokeDasharray={isActive ? "none" : "4 4"}
                          markerEnd="url(#arrowhead)"
                        />
                      );
                    })}

                    {/* Nodes */}
                    {nodes.map((node) => {
                      const color = EQUIPMENT_COLORS[node.type] ?? "#64748b";
                      const isSelected = selectedNode?.id === node.id;
                      const isActive = node.status === "active";
                      return (
                        <g
                          key={node.id}
                          className="node-group"
                          transform={`translate(${node.x}, ${node.y})`}
                          onClick={() => setSelectedNode(isSelected ? null : node)}
                          style={{ cursor: "pointer" }}
                        >
                          {/* Glow ring for selected */}
                          {isSelected && (
                            <circle r="30" fill="none" stroke={color} strokeWidth="2" opacity="0.4" filter="url(#glow)" />
                          )}
                          {/* Status ring */}
                          <circle
                            r="24"
                            fill={`${color}15`}
                            stroke={color}
                            strokeWidth={isSelected ? 2 : 1.5}
                            opacity={isActive ? 1 : 0.5}
                          />
                          {/* Icon background */}
                          <circle r="18" fill={`${color}25`} />
                          {/* Server icon (simplified) */}
                          <rect x="-7" y="-8" width="14" height="5" rx="1.5" fill={color} opacity={isActive ? 0.9 : 0.5} />
                          <rect x="-7" y="-1" width="14" height="5" rx="1.5" fill={color} opacity={isActive ? 0.7 : 0.4} />
                          <rect x="-7" y="6" width="14" height="5" rx="1.5" fill={color} opacity={isActive ? 0.5 : 0.3} />
                          {/* Status dot */}
                          <circle
                            cx="16"
                            cy="-16"
                            r="4"
                            fill={isActive ? "#22c55e" : node.status === "maintenance" ? "#f59e0b" : "#64748b"}
                            stroke="oklch(0.10 0.015 240)"
                            strokeWidth="1.5"
                          />
                          {/* Label */}
                          <text
                            y="36"
                            textAnchor="middle"
                            fontSize="10"
                            fontFamily="Inter, sans-serif"
                            fontWeight="500"
                            fill="oklch(0.85 0.01 240)"
                          >
                            {node.name.length > 16 ? node.name.slice(0, 14) + "…" : node.name}
                          </text>
                          <text
                            y="48"
                            textAnchor="middle"
                            fontSize="8"
                            fontFamily="Inter, sans-serif"
                            fill="oklch(0.55 0.02 240)"
                          >
                            {EQUIPMENT_TYPE_LABELS[node.type] ?? node.type}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Legend + Info Panel */}
        <div className="space-y-4">
          {/* Legend */}
          <Card className="border-border/50 bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Legenda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(EQUIPMENT_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span>{EQUIPMENT_TYPE_LABELS[type] ?? type}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-border/30 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span>Ativo</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-amber-400" />
                  <span>Manutenção</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-slate-500" />
                  <span>Inativo</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Selected Node Info */}
          {selectedNode ? (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
                  <Info className="h-3 w-3" /> Detalhes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Nome</p>
                  <p className="font-medium text-foreground">{selectedNode.name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tipo</p>
                  <p className="font-medium text-foreground">{EQUIPMENT_TYPE_LABELS[selectedNode.type] ?? selectedNode.type}</p>
                </div>
                {selectedNode.model && (
                  <div>
                    <p className="text-muted-foreground">Modelo</p>
                    <p className="font-medium text-foreground">{selectedNode.model}</p>
                  </div>
                )}
                {selectedNode.roomName && (
                  <div>
                    <p className="text-muted-foreground">Sala</p>
                    <p className="font-medium text-foreground">{selectedNode.roomName}</p>
                  </div>
                )}
                {selectedNode.rack && (
                  <div>
                    <p className="text-muted-foreground">Rack</p>
                    <p className="font-medium text-foreground">{selectedNode.rack}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={`text-xs border mt-0.5 ${selectedNode.status === "active" ? "status-active" : selectedNode.status === "maintenance" ? "status-maintenance" : "status-inactive"}`}>
                    {selectedNode.status === "active" ? "Ativo" : selectedNode.status === "maintenance" ? "Manutenção" : "Inativo"}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Conexões</p>
                  <p className="font-medium text-foreground">
                    {edges.filter((e) => e.sourceEquipmentId === selectedNode.id || e.targetEquipmentId === selectedNode.id).length} conexões
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 bg-card">
              <CardContent className="py-6 text-center text-xs text-muted-foreground">
                <Server className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Clique em um nó para ver os detalhes
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex justify-between text-muted-foreground">
                <span>Equipamentos</span>
                <span className="font-medium text-foreground">{nodes.length}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Conexões</span>
                <span className="font-medium text-foreground">{edges.length}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Ativos</span>
                <span className="font-medium text-emerald-400">{nodes.filter((n) => n.status === "active").length}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="text-xs text-muted-foreground/50 text-center">
        Use scroll para zoom · Arraste para mover · Clique em um nó para detalhes
      </p>
    </div>
  );
}
