import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Zap, AlertTriangle } from "lucide-react";
import { LIMITES, type ParametrosOpticos } from "@shared/optica/parametros";

/**
 * Os parâmetros ópticos que entram em todos os balanços.
 *
 * Até à v5.96.73 estes valores só existiam como literais dentro do `db.ts`
 * (0,35 dB/km e 0,1 dB por fusão), e as colunas configuráveis da OLT — que
 * têm ecrã próprio há muito — não eram lidas por caminho nenhum: exigiam uma
 * linha em `olt_port_fiber_links`, tabela vazia nos seis bancos.
 *
 * Este ecrã só existe porque agora há quem leia o que ele grava. Fazê-lo antes
 * disso seria repetir o mesmo erro ao contrário.
 */

const CAMPOS: Array<{
  chave: keyof ParametrosOpticos;
  rotulo: string;
  unidade: string;
  ajuda: string;
}> = [
  {
    chave: "atenuacaoDbPorKm",
    rotulo: "Atenuação da fibra",
    unidade: "dB/km",
    ajuda: "Multiplicada pela distância total do percurso. Valor típico em 1490 nm: 0,35.",
  },
  {
    chave: "perdaPorFusaoDb",
    rotulo: "Perda por fusão",
    unidade: "dB",
    ajuda: "Aplicada a cada fusão encontrada no rastreio. Uma fusão bem feita fica entre 0,05 e 0,1.",
  },
  {
    chave: "perdaPorConectorDb",
    rotulo: "Perda por conector",
    unidade: "dB",
    ajuda: "Definida mas ainda NÃO somada em nenhum balanço: o conector pertence a uma porta de saída concreta, e esse dado por porta ainda não existe no cadastro.",
  },
  {
    chave: "potenciaTxPadraoDbm",
    rotulo: "Potência TX por omissão",
    unidade: "dBm",
    ajuda: "Usada apenas quando o equipamento de origem não tem potência cadastrada. Preencher a potência do equipamento é sempre melhor que confiar neste valor.",
  },
];

export default function CartaoParametrosOpticos() {
  const { data, refetch } = trpc.opticaParametros.get.useQuery();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [tocado, setTocado] = useState(false);

  const guardar = trpc.opticaParametros.save.useMutation({
    onSuccess: () => {
      toast.success("Parâmetros ópticos guardados. Os balanços passam a usá-los.");
      setTocado(false);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!data || tocado) return;
    setValores(Object.fromEntries(
      CAMPOS.map(c => [c.chave, String(data.valores[c.chave])]),
    ));
  }, [data, tocado]);

  // Validar no ecrã com os mesmos limites do servidor, para o erro aparecer
  // enquanto se escreve e não depois de gravar.
  const erroDe = (chave: keyof ParametrosOpticos): string | null => {
    const bruto = (valores[chave] ?? "").replace(",", ".").trim();
    if (bruto === "") return "Em falta.";
    const n = Number(bruto);
    if (!Number.isFinite(n)) return "Não é um número.";
    const [min, max] = LIMITES[chave];
    if (n < min || n > max) return `Fora do intervalo aceite (${min} a ${max}).`;
    return null;
  };

  const erros = CAMPOS.map(c => erroDe(c.chave)).filter(Boolean);
  const podeGuardar = tocado && erros.length === 0 && !guardar.isPending;

  const submeter = () => {
    const saida = Object.fromEntries(
      CAMPOS.map(c => [c.chave, Number((valores[c.chave] ?? "").replace(",", "."))]),
    ) as unknown as ParametrosOpticos;
    guardar.mutate(saida);
  };

  return (
    <Card className="border-border/50 border-amber-500/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          Parâmetros ópticos
        </CardTitle>
        <CardDescription>
          Entram em todos os balanços e rastreios OTDR. Uma OLT com valores próprios
          continua a usá-los para o seu troço; estes valem para todo o resto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(data?.avisos.length ?? 0) > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
            {data!.avisos.map((a, i) => (
              <p key={i} className="text-xs text-amber-300 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{a}</span>
              </p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CAMPOS.map(c => {
            const erro = erroDe(c.chave);
            return (
              <div key={c.chave} className="space-y-2">
                <Label htmlFor={c.chave}>
                  {c.rotulo} <span className="text-muted-foreground font-normal">({c.unidade})</span>
                </Label>
                <Input
                  id={c.chave}
                  inputMode="decimal"
                  value={valores[c.chave] ?? ""}
                  onChange={(e) => {
                    setTocado(true);
                    setValores(v => ({ ...v, [c.chave]: e.target.value }));
                  }}
                  className={erro && tocado ? "border-red-500/60" : undefined}
                />
                {erro && tocado
                  ? <p className="text-xs text-red-400">{erro}</p>
                  : <p className="text-xs text-muted-foreground">{c.ajuda}</p>}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={submeter} disabled={!podeGuardar}>
            {guardar.isPending ? "A guardar…" : "Guardar parâmetros"}
          </Button>
          {tocado && (
            <Button variant="ghost" onClick={() => { setTocado(false); refetch(); }}>
              Descartar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
