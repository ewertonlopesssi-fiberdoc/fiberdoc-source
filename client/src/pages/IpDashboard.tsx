import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Network, Globe, Server, Wifi, AlertTriangle, CheckCircle, Plus, ChevronRight } from "lucide-react";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  infrastructure: { label: "Infraestrutura", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  clients:        { label: "Clientes",        color: "bg-green-500/20 text-green-400 border-green-500/30" },
  management:     { label: "Gerência",        color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  transit:        { label: "Trânsito",        color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  loopback:       { label: "Loopback",        color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  reserved:       { label: "Reservado",       color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  other:          { label: "Outro",           color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:   { label: "Ativo",     color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  inactive: { label: "Inativo",   color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  reserved: { label: "Reservado", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
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

export default function IpDashboard() {
  const { data, isLoading } = trpc.ipDoc.dashboard.useQuery();

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const summary = data ?? {
    totalBlocks: 0, totalHosts: 0, totalAllocated: 0, totalReserved: 0,
    totalFree: 0, utilizationPct: 0, blocks: [],
  };

  const criticalBlocks = (summary.blocks as any[]).filter((b) => b.utilizationPct >= 90);
  const warningBlocks  = (summary.blocks as any[]).filter((b) => b.utilizationPct >= 70 && b.utilizationPct < 90);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            IP DOC — Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão consolidada de todos os blocos de endereçamento IP
          </p>
        </div>
        <Link href="/ip-doc/blocos">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Bloco
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Globe className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Blocos Cadastrados</p>
                <p className="text-2xl font-bold text-foreground">{summary.totalBlocks}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-slate-500/10">
                <Server className="h-5 w-5 text-slate-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total de Hosts</p>
                <p className="text-2xl font-bold text-foreground">{summary.totalHosts.toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IPs Alocados</p>
                <p className="text-2xl font-bold text-emerald-400">{summary.totalAllocated.toLocaleString("pt-BR")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wifi className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Utilização Global</p>
                <p className={`text-2xl font-bold ${utilizationTextColor(summary.utilizationPct)}`}>
                  {summary.utilizationPct}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de utilização global */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Utilização Global do Espaço de Endereçamento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{summary.totalAllocated.toLocaleString("pt-BR")} alocados + {summary.totalReserved.toLocaleString("pt-BR")} reservados</span>
              <span>{summary.totalFree.toLocaleString("pt-BR")} livres</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden flex">
              {summary.totalHosts > 0 && (
                <>
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${(summary.totalAllocated / summary.totalHosts) * 100}%` }}
                  />
                  <div
                    className="bg-yellow-500 transition-all"
                    style={{ width: `${(summary.totalReserved / summary.totalHosts) * 100}%` }}
                  />
                </>
              )}
            </div>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Alocado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Reservado</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted inline-block" /> Livre</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alertas */}
      {(criticalBlocks.length > 0 || warningBlocks.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {criticalBlocks.length > 0 && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Blocos Críticos (≥90%)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {criticalBlocks.map((b: any) => (
                  <Link key={b.id} href={`/ip-doc/blocos/${b.id}`}>
                    <div className="flex items-center justify-between p-2 rounded bg-red-500/10 hover:bg-red-500/20 cursor-pointer transition-colors">
                      <div>
                        <p className="text-sm font-medium text-foreground">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.cidr}</p>
                      </div>
                      <span className="text-sm font-bold text-red-400">{b.utilizationPct}%</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          {warningBlocks.length > 0 && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-yellow-400 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Blocos em Atenção (70–89%)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {warningBlocks.map((b: any) => (
                  <Link key={b.id} href={`/ip-doc/blocos/${b.id}`}>
                    <div className="flex items-center justify-between p-2 rounded bg-yellow-500/10 hover:bg-yellow-500/20 cursor-pointer transition-colors">
                      <div>
                        <p className="text-sm font-medium text-foreground">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.cidr}</p>
                      </div>
                      <span className="text-sm font-bold text-yellow-400">{b.utilizationPct}%</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Grid de blocos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">Todos os Blocos</h2>
          <Link href="/ip-doc/relatorios">
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              Ver Relatórios <ChevronRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>

        {(summary.blocks as any[]).length === 0 ? (
          <Card className="border-dashed border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Network className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum bloco IP cadastrado</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Clique em "Novo Bloco" para começar</p>
              <Link href="/ip-doc/blocos">
                <Button className="mt-4 gap-2" size="sm">
                  <Plus className="h-4 w-4" /> Cadastrar Primeiro Bloco
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(summary.blocks as any[]).map((block) => {
              const typeInfo = TYPE_LABELS[block.type] ?? TYPE_LABELS.other;
              const statusInfo = STATUS_LABELS[block.status] ?? STATUS_LABELS.active;
              return (
                <Link key={block.id} href={`/ip-doc/blocos/${block.id}`}>
                  <Card className="border-border/50 hover:border-primary/40 hover:bg-accent/30 transition-all cursor-pointer group">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                            {block.name}
                          </p>
                          <p className="text-xs font-mono text-muted-foreground mt-0.5">{block.cidr}</p>
                        </div>
                        <div className="flex flex-col gap-1 items-end shrink-0">
                          <Badge variant="outline" className={`text-xs ${typeInfo.color}`}>
                            {typeInfo.label}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${statusInfo.color}`}>
                            {statusInfo.label}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {block.vlan && (
                        <p className="text-xs text-muted-foreground">VLAN: <span className="text-foreground font-medium">{block.vlan}</span></p>
                      )}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Utilização</span>
                          <span className={`font-medium ${utilizationTextColor(block.utilizationPct)}`}>
                            {block.used}/{block.totalHosts} ({block.utilizationPct}%)
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${utilizationColor(block.utilizationPct)}`}
                            style={{ width: `${Math.min(block.utilizationPct, 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Alocados</p>
                          <p className="text-sm font-bold text-emerald-400">{block.stats?.allocated ?? 0}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Reservados</p>
                          <p className="text-sm font-bold text-yellow-400">{block.stats?.reserved ?? 0}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Livres</p>
                          <p className="text-sm font-bold text-muted-foreground">
                            {block.totalHosts - (block.stats?.allocated ?? 0) - (block.stats?.reserved ?? 0) - (block.stats?.dhcp ?? 0)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
