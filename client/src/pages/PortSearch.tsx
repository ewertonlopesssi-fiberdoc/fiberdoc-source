import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Server, ExternalLink, Zap, Tag, CheckCircle, AlertCircle, Clock, XCircle } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  free:     { label: "Livre",     color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle },
  occupied: { label: "Ocupada",   color: "bg-red-500/20 text-red-400 border-red-500/30",             icon: XCircle },
  reserved: { label: "Reservada", color: "bg-amber-500/20 text-amber-400 border-amber-500/30",       icon: Clock },
  faulty:   { label: "Com Falha", color: "bg-orange-500/20 text-orange-400 border-orange-500/30",    icon: AlertCircle },
};

const TYPE_LABELS: Record<string, string> = {
  sc: "SC", lc: "LC", fc: "FC", st: "ST", rj45: "RJ45",
  sfp: "SFP", sfp_plus: "SFP+", qsfp: "QSFP", qsfp28: "QSFP28",
  qsfp_dd: "QSFP-DD", cfp: "CFP", cfp2: "CFP2", cfp4: "CFP4",
  gpon: "GPON", xgspon: "XGS-PON", dag: "DAG", other: "Outro",
};

const SPEED_LABELS: Record<string, string> = {
  "1g": "1G", "10g": "10G", "25g": "25G", "40g": "40G", "100g": "100G", "400g": "400G", other: "Outro",
};

export default function PortSearch() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleInput = useCallback((val: string) => {
    setQuery(val);
    if (timer) clearTimeout(timer);
    const t = setTimeout(() => setDebouncedQuery(val.trim()), 400);
    setTimer(t);
  }, [timer]);

  const { data: results = [], isLoading } = trpc.ports.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Busca de Porta</h1>
        <p className="text-muted-foreground text-sm mt-1">Encontre portas por etiqueta, número ou descrição em todos os equipamentos</p>
      </div>

      {/* Search Input */}
      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="Digite etiqueta, número de porta ou nome do equipamento..."
          value={query}
          onChange={e => handleInput(e.target.value)}
          className="pl-9 text-sm"
        />
      </div>

      {/* Results */}
      {debouncedQuery.length < 2 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Digite pelo menos 2 caracteres para buscar</p>
        </div>
      )}

      {debouncedQuery.length >= 2 && isLoading && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm animate-pulse">Buscando...</p>
        </div>
      )}

      {debouncedQuery.length >= 2 && !isLoading && results.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma porta encontrada para "<strong>{debouncedQuery}</strong>"</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{results.length} resultado{results.length !== 1 ? "s" : ""} encontrado{results.length !== 1 ? "s" : ""}</p>
          <div className="grid gap-3">
            {results.map((port: any) => {
              const st = STATUS_LABELS[port.status] ?? STATUS_LABELS.free;
              const StatusIcon = st.icon;
              return (
                <Card key={port.id} className="bg-card border-border hover:border-border/80 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="mt-0.5 p-1.5 rounded-md bg-muted/50">
                          <Zap className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div className="min-w-0">
                          {/* Porta e etiqueta */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground text-sm">Porta {port.portNumber}</span>
                            {port.label && (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                                <Tag className="w-3 h-3" />
                                {port.label}
                              </span>
                            )}
                          </div>
                          {/* Equipamento */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Server className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{port.equipmentName ?? `Equipamento #${port.equipmentId}`}</span>
                          </div>
                          {/* Notas */}
                          {port.notes && (
                            <p className="text-xs text-muted-foreground mt-1 truncate max-w-xs">{port.notes}</p>
                          )}
                          {/* Tags de tipo e velocidade */}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Badge variant="outline" className="text-xs h-5 px-1.5 border-border/50 text-muted-foreground">
                              {TYPE_LABELS[port.type] ?? port.type}
                            </Badge>
                            {port.speed && (
                              <Badge variant="outline" className="text-xs h-5 px-1.5 border-border/50 text-muted-foreground">
                                {SPEED_LABELS[port.speed] ?? port.speed}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Status + Ação */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${st.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {st.label}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1 text-cyan-400 hover:text-cyan-300"
                          onClick={() => setLocation(`/equipamentos/${port.equipmentId}`)}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Ver Equipamento
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
