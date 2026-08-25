import { trpc } from "@/lib/trpc";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Sub-componente para seletores de tubo (evita hooks em IIFE)
export default function TubeSelectors({ fromElId, toElId, fromTubeId, toTubeId, onChange }: {
  fromElId: number | null;
  toElId: number | null;
  fromTubeId: number | null;
  toTubeId: number | null;
  onChange: (field: "fromTubeId" | "toTubeId", value: number | null) => void;
}) {
  const fromTubesQuery = trpc.infraMap.tubesByElement.useQuery(
    { elementId: fromElId! },
    { enabled: fromElId != null }
  );
  const toTubesQuery = trpc.infraMap.tubesByElement.useQuery(
    { elementId: toElId! },
    { enabled: toElId != null }
  );
  const fromTubes = (fromTubesQuery.data ?? []) as { id: number; identifier: string; totalVias: number; color: string | null; type: string }[];
  const toTubes = (toTubesQuery.data ?? []) as { id: number; identifier: string; totalVias: number; color: string | null; type: string }[];
  if (!fromElId && !toElId) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs text-muted-foreground"><span className="text-emerald-400 font-bold">DE</span> Tubo na Origem</Label>
        {fromElId ? (
          fromTubesQuery.isLoading ? (
            <div className="text-xs text-muted-foreground py-1">Carregando tubos...</div>
          ) : fromTubes.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-1">Nenhum tubo cadastrado</div>
          ) : (
            <Select
              value={fromTubeId != null ? String(fromTubeId) : "none"}
              onValueChange={v => onChange("fromTubeId", v === "none" ? null : Number(v))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Nenhum">{fromTubes.find(t => t.id === fromTubeId)?.identifier ?? "Nenhum"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {fromTubes.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-emerald-400">{t.type === "splitter" ? "SPL" : "TUB"}</span>
                      {t.identifier} <span className="text-muted-foreground">({t.totalVias}v)</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : <div className="text-xs text-muted-foreground italic py-1">Selecione a origem</div>}
      </div>
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs text-muted-foreground"><span className="text-cyan-400 font-bold">PARA</span> Tubo no Destino</Label>
        {toElId ? (
          toTubesQuery.isLoading ? (
            <div className="text-xs text-muted-foreground py-1">Carregando tubos...</div>
          ) : toTubes.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-1">Nenhum tubo cadastrado</div>
          ) : (
            <Select
              value={toTubeId != null ? String(toTubeId) : "none"}
              onValueChange={v => onChange("toTubeId", v === "none" ? null : Number(v))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Nenhum">{toTubes.find(t => t.id === toTubeId)?.identifier ?? "Nenhum"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {toTubes.map(t => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    <span className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-cyan-400">{t.type === "splitter" ? "SPL" : "TUB"}</span>
                      {t.identifier} <span className="text-muted-foreground">({t.totalVias}v)</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : <div className="text-xs text-muted-foreground italic py-1">Selecione o destino</div>}
      </div>
    </div>
  );
}

