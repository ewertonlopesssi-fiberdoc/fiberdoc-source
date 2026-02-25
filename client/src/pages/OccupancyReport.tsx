import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Printer, Server, CircuitBoard, CheckCircle, AlertTriangle, XCircle, Clock, Filter,
  ChevronDown, ChevronRight, FileText,
} from "lucide-react";
import { useLocation } from "wouter";

// ─── Labels ───────────────────────────────────────────────────────────────────
const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  switch: "Switch", olt: "OLT", dgo: "DGO", splitter: "Splitter",
  router: "Roteador", server: "Servidor", patch_panel: "Patch Panel",
  amplifier: "Amplificador", other: "Outro",
};
const PORT_TYPE_LABELS: Record<string, string> = {
  sc: "SC", lc: "LC", fc: "FC", st: "ST", rj45: "RJ45", sfp: "SFP",
  sfp_plus: "SFP+", qsfp: "QSFP", qsfp28: "QSFP28", qsfp_dd: "QSFP-DD",
  cfp: "CFP", cfp2: "CFP2", cfp4: "CFP4", gpon: "GPON", xgspon: "XGS-PON",
  dag: "DAG", other: "Outro",
};
const PORT_STATUS_LABELS: Record<string, string> = {
  free: "Livre", occupied: "Ocupada", reserved: "Reservada", faulty: "Com Falha",
};
const PORT_STATUS_COLORS: Record<string, string> = {
  free: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  occupied: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  reserved: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  faulty: "text-red-400 bg-red-400/10 border-red-400/20",
};

function OccupancyBar({ rate }: { rate: number }) {
  const color = rate >= 100 ? "bg-red-400" : rate >= 90 ? "bg-orange-400" : rate >= 80 ? "bg-amber-400" : rate >= 60 ? "bg-yellow-400" : "bg-emerald-400";
  const textColor = rate >= 100 ? "text-red-400" : rate >= 90 ? "text-orange-400" : rate >= 80 ? "text-amber-400" : rate >= 60 ? "text-yellow-400" : "text-emerald-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
      <span className={`text-xs font-bold w-9 text-right ${textColor}`}>{rate}%</span>
    </div>
  );
}

function EquipmentSection({ row, expanded, onToggle }: {
  row: {
    equipmentId: number; equipmentName: string; equipmentType: string;
    roomName: string | null; totalPorts: number; freePorts: number;
    occupiedPorts: number; reservedPorts: number; faultyPorts: number;
    occupancyRate: number;
    ports: Array<{ id: number; portNumber: string; label: string | null; type: string; speed: string | null; status: string; notes: string | null }>;
  };
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden print-section">
      {/* Header do equipamento */}
      <div
        className="flex items-center gap-3 p-4 bg-card cursor-pointer hover:bg-muted/20 transition-colors print-always"
        onClick={onToggle}
      >
        <div className="h-9 w-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
          <Server className="h-4 w-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm text-foreground">{row.equipmentName}</h3>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/40 text-muted-foreground">
              {EQUIPMENT_TYPE_LABELS[row.equipmentType] ?? row.equipmentType}
            </Badge>
            {row.roomName && (
              <span className="text-xs text-muted-foreground">· {row.roomName}</span>
            )}
          </div>
          <div className="mt-1.5">
            <OccupancyBar rate={row.occupancyRate} />
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
          <span className="text-emerald-400 font-medium">{row.freePorts} livres</span>
          <span className="text-blue-400 font-medium">{row.occupiedPorts} ocupadas</span>
          {row.reservedPorts > 0 && <span className="text-amber-400 font-medium">{row.reservedPorts} reservadas</span>}
          {row.faultyPorts > 0 && <span className="text-red-400 font-medium">{row.faultyPorts} c/ falha</span>}
          <span className="text-muted-foreground">{row.totalPorts} total</span>
          <span className="print-hide">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </div>
      </div>

      {/* Tabela de portas */}
      {expanded && row.ports.length > 0 && (
        <div className="border-t border-border/30 print-ports">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border/30">
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider w-24">Porta</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider">Etiqueta</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider w-20">Tipo</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider w-20">Velocidade</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider w-28">Status</th>
                <th className="text-left px-4 py-2 font-semibold text-muted-foreground uppercase tracking-wider">Observações</th>
              </tr>
            </thead>
            <tbody>
              {row.ports.map((port, i) => (
                <tr key={port.id} className={`border-b border-border/20 last:border-0 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                  <td className="px-4 py-2 font-mono font-medium text-foreground">{port.portNumber}</td>
                  <td className="px-4 py-2 text-muted-foreground">{port.label ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border/40 text-muted-foreground">
                      {PORT_TYPE_LABELS[port.type] ?? port.type.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground font-mono">{port.speed ? port.speed.toUpperCase() : "—"}</td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${PORT_STATUS_COLORS[port.status] ?? ""}`}>
                      {PORT_STATUS_LABELS[port.status] ?? port.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground truncate max-w-xs">{port.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {expanded && row.ports.length === 0 && (
        <div className="border-t border-border/30 px-4 py-6 text-center text-muted-foreground text-xs">
          Nenhuma porta cadastrada para este equipamento
        </div>
      )}
    </div>
  );
}

export default function OccupancyReport() {
  const [, setLocation] = useLocation();
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [equipmentFilter, setEquipmentFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const { data: rooms = [] } = trpc.rooms.list.useQuery();
  const { data: equipments = [] } = trpc.equipments.list.useQuery({});

  const queryInput = useMemo(() => ({
    roomId: roomFilter !== "all" ? parseInt(roomFilter) : undefined,
    equipmentId: equipmentFilter !== "all" ? parseInt(equipmentFilter) : undefined,
  }), [roomFilter, equipmentFilter]);

  const { data: report = [], isLoading } = trpc.reports.occupancy.useQuery(queryInput);

  const filteredEquipments = useMemo(() => {
    if (roomFilter === "all") return equipments;
    return equipments.filter((e) => String((e as any).roomId) === roomFilter);
  }, [equipments, roomFilter]);

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedIds(new Set(report.map((r) => r.equipmentId)));
  }

  function collapseAll() {
    setExpandedIds(new Set());
  }

  function handlePrint() {
    // Expand all before printing
    setExpandedIds(new Set(report.map((r) => r.equipmentId)));
    setTimeout(() => window.print(), 200);
  }

  const totalPorts = report.reduce((s, r) => s + r.totalPorts, 0);
  const totalOccupied = report.reduce((s, r) => s + r.occupiedPorts, 0);
  const totalFree = report.reduce((s, r) => s + r.freePorts, 0);
  const totalFaulty = report.reduce((s, r) => s + r.faultyPorts, 0);
  const globalRate = totalPorts > 0 ? Math.round((totalOccupied / totalPorts) * 100) : 0;

  const now = new Date().toLocaleString("pt-BR");

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .print-hide { display: none !important; }
          .print-ports { display: block !important; }
          .print-section { break-inside: avoid; margin-bottom: 12px; border: 1px solid #ccc !important; }
          .print-always { cursor: default !important; }
          table { border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 4px 8px; font-size: 10px; }
          th { background: #f5f5f5 !important; }
          .print-header { display: block !important; }
        }
        .print-header { display: none; }
      `}</style>

      <div className="space-y-6 max-w-7xl">
        {/* Print header (only visible when printing) */}
        <div className="print-header">
          <h1 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>Relatório de Ocupação de Portas</h1>
          <p style={{ fontSize: 11, color: "#666" }}>Gerado em: {now}</p>
          {roomFilter !== "all" && (
            <p style={{ fontSize: 11, color: "#666" }}>Sala: {rooms.find((r) => String(r.id) === roomFilter)?.name ?? roomFilter}</p>
          )}
          {equipmentFilter !== "all" && (
            <p style={{ fontSize: 11, color: "#666" }}>Equipamento: {equipments.find((e) => String(e.id) === equipmentFilter)?.name ?? equipmentFilter}</p>
          )}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between print-hide">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Relatório de Ocupação</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Relatório detalhado de portas por equipamento — útil para auditorias e dimensionamento
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setLocation("/equipamentos")} className="gap-2 border-border/50 print-hide">
              <Server className="h-4 w-4" />
              Equipamentos
            </Button>
            <Button onClick={handlePrint} className="gap-2 print-hide">
              <Printer className="h-4 w-4" />
              Imprimir / PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-border/50 bg-card print-hide">
          <CardContent className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Sala / Local:</Label>
                <Select value={roomFilter} onValueChange={(v) => { setRoomFilter(v); setEquipmentFilter("all"); }}>
                  <SelectTrigger className="w-48 h-8 text-xs bg-background border-border/50">
                    <SelectValue placeholder="Todas as salas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as salas</SelectItem>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Equipamento:</Label>
                <Select value={equipmentFilter} onValueChange={setEquipmentFilter}>
                  <SelectTrigger className="w-56 h-8 text-xs bg-background border-border/50">
                    <SelectValue placeholder="Todos os equipamentos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os equipamentos</SelectItem>
                    {filteredEquipments.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary stats */}
        {!isLoading && report.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Equipamentos", value: report.length, icon: Server, color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
              { label: "Total de Portas", value: totalPorts, icon: CircuitBoard, color: "text-foreground bg-muted/30 border-border/40" },
              { label: "Portas Livres", value: totalFree, icon: CheckCircle, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
              { label: "Portas Ocupadas", value: totalOccupied, icon: AlertTriangle, color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
              { label: "Com Falha", value: totalFaulty, icon: XCircle, color: "text-red-400 bg-red-400/10 border-red-400/20" },
            ].map((stat) => (
              <Card key={stat.label} className="border-border/50 bg-card">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                      <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                    </div>
                    <div className={`h-8 w-8 rounded-lg border flex items-center justify-center ${stat.color}`}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Global occupancy bar */}
        {!isLoading && report.length > 0 && (
          <Card className="border-border/50 bg-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Ocupação Global</span>
                <span className="text-xs text-muted-foreground">{totalOccupied} de {totalPorts} portas ocupadas</span>
              </div>
              <OccupancyBar rate={globalRate} />
            </CardContent>
          </Card>
        )}

        {/* Controls */}
        {!isLoading && report.length > 0 && (
          <div className="flex items-center justify-between print-hide">
            <span className="text-sm text-muted-foreground">
              {report.length} equipamento{report.length !== 1 ? "s" : ""} encontrado{report.length !== 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={expandAll} className="text-xs border-border/50">
                Expandir todos
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs border-border/50">
                Recolher todos
              </Button>
            </div>
          </div>
        )}

        {/* Equipment list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : report.length === 0 ? (
          <Card className="border-border/50 bg-card">
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-muted-foreground font-medium">Nenhum equipamento encontrado</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Ajuste os filtros ou cadastre equipamentos e portas</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {report.map((row) => (
              <EquipmentSection
                key={row.equipmentId}
                row={row}
                expanded={expandedIds.has(row.equipmentId)}
                onToggle={() => toggleExpand(row.equipmentId)}
              />
            ))}
          </div>
        )}

        {/* Print footer */}
        <div className="print-header" style={{ marginTop: 24, borderTop: "1px solid #ccc", paddingTop: 8 }}>
          <p style={{ fontSize: 10, color: "#999" }}>
            FiberDoc — Sistema de Gestão de Infraestrutura de Rede Óptica · {now}
          </p>
        </div>
      </div>
    </>
  );
}
