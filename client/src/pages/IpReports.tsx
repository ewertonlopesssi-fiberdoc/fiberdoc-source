import { useState, useRef } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Network, BarChart3, Download, Printer, ChevronLeft, Globe, AlertTriangle, CheckCircle, FileText } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  infrastructure: "Infraestrutura",
  clients:        "Clientes",
  management:     "Gerência",
  transit:        "Trânsito",
  loopback:       "Loopback",
  reserved:       "Reservado",
  other:          "Outro",
};

const STATUS_LABELS: Record<string, string> = {
  active:   "Ativo",
  inactive: "Inativo",
  reserved: "Reservado",
};

function utilizationColor(pct: number) {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-emerald-500";
}

function utilizationTextColor(pct: number) {
  if (pct >= 90) return "text-red-400";
  if (pct >= 70) return "text-yellow-400";
  return "text-emerald-400";
}

function utilizationBadgeColor(pct: number) {
  if (pct >= 90) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (pct >= 70) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
}

export default function IpReports() {
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "utilization" | "hosts">("utilization");
  const printRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = trpc.ipDoc.dashboard.useQuery();

  const summary = data ?? {
    totalBlocks: 0, totalHosts: 0, totalAllocated: 0, totalReserved: 0,
    totalFree: 0, utilizationPct: 0, blocks: [],
  };

  let blocks = (summary.blocks as any[]).filter((b) => filterType === "all" || b.type === filterType);

  if (sortBy === "utilization") blocks = [...blocks].sort((a, b) => b.utilizationPct - a.utilizationPct);
  else if (sortBy === "hosts") blocks = [...blocks].sort((a, b) => b.totalHosts - a.totalHosts);
  else blocks = [...blocks].sort((a, b) => a.name.localeCompare(b.name));

  const criticalCount = (summary.blocks as any[]).filter((b) => b.utilizationPct >= 90).length;
  const warningCount  = (summary.blocks as any[]).filter((b) => b.utilizationPct >= 70 && b.utilizationPct < 90).length;
  const healthyCount  = (summary.blocks as any[]).filter((b) => b.utilizationPct < 70).length;

  const handlePrint = () => window.print();

  const handleExportCsv = () => {
    const header = ["Nome", "CIDR", "Tipo", "Status", "VLAN", "Total Hosts", "Alocados", "Reservados", "DHCP", "Livres", "Utilização (%)"];
    const rows = (summary.blocks as any[]).map((b) => [
      b.name, b.cidr,
      TYPE_LABELS[b.type] ?? b.type,
      STATUS_LABELS[b.status] ?? b.status,
      b.vlan ?? "",
      b.totalHosts,
      b.stats?.allocated ?? 0,
      b.stats?.reserved ?? 0,
      b.stats?.dhcp ?? 0,
      b.totalHosts - b.used,
      b.utilizationPct,
    ]);
    const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fiberdoc-ip-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 print:p-4">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Relatórios IP DOC
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise de utilização de blocos de endereçamento IP
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCsv}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              const a = document.createElement("a");
              a.href = "/api/ip-report-pdf";
              a.download = `fiberdoc-ip-report-${new Date().toISOString().slice(0, 10)}.pdf`;
              a.click();
            }}
          >
            <FileText className="h-4 w-4" /> Exportar PDF
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        </div>
      </div>

      {/* Cabeçalho de impressão */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">FiberDoc — Relatório IP DOC</h1>
        <p className="text-sm text-gray-500">Gerado em: {new Date().toLocaleString("pt-BR")}</p>
      </div>

      {/* KPI resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total de Blocos</p>
            <p className="text-2xl font-bold text-foreground">{summary.totalBlocks}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Total de Hosts</p>
            <p className="text-2xl font-bold text-foreground">{summary.totalHosts.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">IPs Alocados</p>
            <p className="text-2xl font-bold text-emerald-400">{summary.totalAllocated.toLocaleString("pt-BR")}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Utilização Global</p>
            <p className={`text-2xl font-bold ${utilizationTextColor(summary.utilizationPct)}`}>
              {summary.utilizationPct}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status de saúde */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-400 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-red-400">{criticalCount}</p>
              <p className="text-xs text-muted-foreground">Blocos Críticos (≥90%)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-yellow-400 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-yellow-400">{warningCount}</p>
              <p className="text-xs text-muted-foreground">Em Atenção (70–89%)</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-emerald-400 shrink-0" />
            <div>
              <p className="text-2xl font-bold text-emerald-400">{healthyCount}</p>
              <p className="text-xs text-muted-foreground">Saudáveis (&lt;70%)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição por tipo */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Distribuição por Tipo de Bloco</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(TYPE_LABELS).map(([type, label]) => {
              const count = (summary.blocks as any[]).filter((b) => b.type === type).length;
              const hosts = (summary.blocks as any[]).filter((b) => b.type === type).reduce((a: number, b: any) => a + b.totalHosts, 0);
              if (count === 0) return null;
              return (
                <div key={type} className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold text-foreground">{count} bloco{count !== 1 ? "s" : ""}</p>
                  <p className="text-xs text-muted-foreground">{hosts.toLocaleString("pt-BR")} hosts</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filtros e ordenação */}
      <div className="flex gap-2 flex-wrap print:hidden">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Filtrar por tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="utilization">Ordenar por utilização</SelectItem>
            <SelectItem value="hosts">Ordenar por total de hosts</SelectItem>
            <SelectItem value="name">Ordenar por nome</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela detalhada */}
      <Card className="border-border/50" ref={printRef}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Detalhamento por Bloco</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {blocks.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Nenhum bloco encontrado com os filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Bloco</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">CIDR</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Tipo</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Alocados</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Reservados</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">DHCP</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Livres</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground min-w-36">Utilização</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((block: any, idx: number) => {
                    const free = block.totalHosts - block.used;
                    return (
                      <tr key={block.id} className={`border-b border-border/30 hover:bg-muted/20 transition-colors print:hover:bg-transparent ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                        <td className="px-4 py-2.5">
                          <Link href={`/ip-doc/blocos/${block.id}`}>
                            <span className="font-medium text-foreground hover:text-primary cursor-pointer transition-colors print:text-black">
                              {block.name}
                            </span>
                          </Link>
                          {block.vlan && <span className="ml-2 text-xs text-muted-foreground font-mono">VLAN {block.vlan}</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{block.cidr}</td>
                        <td className="px-4 py-2.5">
                          <Badge variant="outline" className="text-xs">{TYPE_LABELS[block.type] ?? block.type}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{block.totalHosts.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-400 font-medium">{block.stats?.allocated ?? 0}</td>
                        <td className="px-4 py-2.5 text-right text-yellow-400 font-medium">{block.stats?.reserved ?? 0}</td>
                        <td className="px-4 py-2.5 text-right text-blue-400 font-medium">{block.stats?.dhcp ?? 0}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{free.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-16">
                              <div
                                className={`h-full rounded-full ${utilizationColor(block.utilizationPct)}`}
                                style={{ width: `${Math.min(block.utilizationPct, 100)}%` }}
                              />
                            </div>
                            <Badge variant="outline" className={`text-xs shrink-0 ${utilizationBadgeColor(block.utilizationPct)}`}>
                              {block.utilizationPct}%
                            </Badge>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30">
                    <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-foreground">Total</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-foreground">{summary.totalHosts.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-emerald-400">{summary.totalAllocated.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-yellow-400">{summary.totalReserved.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-blue-400">—</td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{summary.totalFree.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={`text-xs ${utilizationBadgeColor(summary.utilizationPct)}`}>
                        {summary.utilizationPct}% global
                      </Badge>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blocos críticos destacados */}
      {criticalCount > 0 && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Ação Necessária — Blocos com Utilização Crítica (≥90%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Os blocos abaixo estão com alta utilização e podem precisar de expansão ou realocação de endereços.
            </p>
            <div className="space-y-2">
              {(summary.blocks as any[])
                .filter((b) => b.utilizationPct >= 90)
                .sort((a: any, b: any) => b.utilizationPct - a.utilizationPct)
                .map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <div>
                      <p className="font-medium text-foreground">{b.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{b.cidr} — {b.totalHosts - b.used} IPs livres de {b.totalHosts}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-red-400">{b.utilizationPct}%</span>
                      <Link href={`/ip-doc/blocos/${b.id}`}>
                        <Button size="sm" variant="outline" className="text-xs border-red-500/30 hover:bg-red-500/10">
                          Gerenciar
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
