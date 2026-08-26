import { useState } from "react";
import { RotateCcw, X } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { APP_VERSION } from "@/lib/buildVersion";
import { precisaRecarregar } from "@shared/versionCheck";

/**
 * Avisa quando a aba ficou para trás em relação ao servidor.
 *
 * Existe por causa de um incidente concreto: durante o deploy da v5.96.55 o
 * mapa passou a estourar "Ocorreu um erro inesperado" em quem estava com a
 * aba aberta desde antes. Não havia bug no código — o bundle carregado era
 * de outra build. Recarregar resolveu, mas ninguém tinha como saber disso.
 *
 * Não é modal e não recarrega sozinho: alguém pode estar no meio de um
 * traçado de cabo, e perder isso seria pior que o problema que resolve.
 */
export default function NovaVersaoBanner() {
  const [dispensado, setDispensado] = useState(false);

  const { data } = trpc.system.appVersion.useQuery(undefined, {
    // Cinco minutos é frequente o bastante para pegar um deploy antes de a
    // pessoa esbarrar no erro, e raro o bastante para não pesar.
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    // Sem retry: se a rede caiu, o próximo ciclo tenta de novo. Insistir só
    // encheria o console de erro em quem está com internet instável em campo.
    retry: false,
  });

  const desatualizado = precisaRecarregar(APP_VERSION, data?.version);
  if (!desatualizado || dispensado) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2.5 rounded-lg border border-amber-500/40 bg-card shadow-2xl max-w-[calc(100vw-2rem)]"
      style={{ zIndex: 5000 }}
      role="status"
    >
      <div className="text-xs leading-tight">
        <div className="font-medium">Nova versão disponível</div>
        <div className="text-muted-foreground">
          Esta aba está na v{APP_VERSION}; o servidor já está na v{data?.version}.
        </div>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 shrink-0"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Recarregar
      </button>
      <button
        onClick={() => setDispensado(true)}
        title="Dispensar"
        aria-label="Dispensar aviso de nova versão"
        className="text-muted-foreground/60 hover:text-foreground shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
