import { cn } from "@/lib/utils";
import { AlertTriangle, Copy, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { APP_VERSION } from "@/lib/buildVersion";
interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
  autoRecovering: boolean;
}

/**
 * Monta o texto que a pessoa copia e manda para quem vai investigar.
 *
 * A mensagem entra separada da pilha de propósito. No Firefox, `error.stack`
 * traz só os quadros — sem o nome e sem a mensagem do erro. Esta tela exibia
 * apenas a pilha, e o resultado foi uma investigação inteira gasta em cima de
 * `oM@...:49:87866` repetido, quando a primeira linha ("Minified React error
 * #NNN") teria dito a causa de imediato.
 */
function textoDoErro(error: Error | null): string {
  const nome = error?.name || "Error";
  const msg = error?.message || "(sem mensagem)";
  const pilha = error?.stack || "(sem pilha)";
  return [
    `FiberDoc v${APP_VERSION}`,
    `${nome}: ${msg}`,
    "",
    pilha,
  ].join("\n");
}

// Erros do Leaflet que podem ser recuperados automaticamente
const LEAFLET_RECOVERABLE_ERRORS = [
  "removeChild",
  "NotFoundError",
  "The node to be removed is not a child",
  "O nó a ser removido não é filho",
];

function isLeafletError(error: Error): boolean {
  const msg = (error?.message ?? "") + (error?.stack ?? "");
  return LEAFLET_RECOVERABLE_ERRORS.some(e => msg.includes(e));
}

class ErrorBoundary extends Component<Props, State> {
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, autoRecovering: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Para erros do Leaflet, marcar para auto-recovery
    if (isLeafletError(error)) {
      return { hasError: true, error, autoRecovering: true };
    }
    return { hasError: true, error, autoRecovering: false };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[ErrorBoundary] Erro capturado:", error, info);
    // Auto-recovery para erros do Leaflet: recarregar após 1s
    if (isLeafletError(error)) {
      console.warn("[ErrorBoundary] Erro do Leaflet detectado, recarregando automaticamente...");
      this.recoveryTimer = setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  }

  componentWillUnmount() {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
  }

  render() {
    if (this.state.hasError) {
      if (this.state.autoRecovering) {
        // Tela de recuperação automática para erros do Leaflet
        return (
          <div className="flex items-center justify-center min-h-screen p-8 bg-background">
            <div className="flex flex-col items-center w-full max-w-2xl p-8">
              <div className="animate-spin mb-6">
                <RotateCcw size={48} className="text-primary" />
              </div>
              <h2 className="text-xl mb-2">Recuperando o mapa...</h2>
              <p className="text-muted-foreground text-sm">Um erro temporário foi detectado. A página será recarregada automaticamente.</p>
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />
            <h2 className="text-xl mb-1">Ocorreu um erro inesperado.</h2>
            <p className="text-xs text-muted-foreground mb-4">FiberDoc v{APP_VERSION}</p>
            {/* A mensagem em destaque, acima da pilha: é ela que identifica a
                causa, e no Firefox ela não aparece dentro de error.stack. */}
            <div className="p-3 w-full rounded bg-destructive/10 border border-destructive/30 mb-3">
              <pre className="text-sm text-foreground whitespace-break-spaces font-medium">
                {(this.state.error?.name || "Error")}: {this.state.error?.message || "(sem mensagem)"}
              </pre>
            </div>
            <div className="p-4 w-full rounded bg-muted overflow-auto mb-4 max-h-64">
              <pre className="text-xs text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack ?? "(sem pilha)"}
              </pre>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.location.reload()}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg",
                  "bg-primary text-primary-foreground",
                  "hover:opacity-90 cursor-pointer"
                )}
              >
                <RotateCcw size={16} />
                Recarregar página
              </button>
              <button
                onClick={() => {
                  // clipboard falha em http:// e em navegador antigo; sem
                  // clipboard a pessoa ainda pode selecionar o texto acima.
                  navigator.clipboard?.writeText(textoDoErro(this.state.error)).catch(() => {});
                }}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border border-border",
                  "text-muted-foreground hover:text-foreground cursor-pointer"
                )}
              >
                <Copy size={16} />
                Copiar detalhes
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
export default ErrorBoundary;
