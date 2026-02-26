import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  Network,
  Server,
  Cable,
  QrCode,
  BarChart3,
  Smartphone,
  CheckCircle2,
  ArrowRight,
  Shield,
  Database,
} from "lucide-react";

const features = [
  {
    icon: Server,
    title: "Equipamentos",
    desc: "Cadastre switches, roteadores, OLTs e racks com tipo de energia (DC/AC) e fonte retificadora.",
  },
  {
    icon: Cable,
    title: "Fibras e Portas",
    desc: "Documente fibras ópticas, portas, slots e conexões com status em tempo real.",
  },
  {
    icon: Network,
    title: "CEO e Topologia",
    desc: "Gerencie caixas de emenda óptica com tubos, vias e visualização de topologia de racks.",
  },
  {
    icon: BarChart3,
    title: "Relatório de Ocupação",
    desc: "Gere relatórios imprimíveis por sala ou equipamento para auditorias e dimensionamento.",
  },
  {
    icon: QrCode,
    title: "QR Code",
    desc: "Gere QR Codes por equipamento para acesso rápido via app mobile em campo.",
  },
  {
    icon: Smartphone,
    title: "App Mobile PWA",
    desc: "Acesse e edite dados pelo celular com suporte a visualização offline de equipamentos e CEO.",
  },
];

export default function Welcome() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);

  const { data: stats } = trpc.dashboard.stats.useQuery(undefined, {
    retry: false,
  });

  // Se já tem dados cadastrados, redirecionar para o dashboard
  if (stats && (stats.totalEquipments > 0 || stats.totalRooms > 0)) {
    navigate("/");
    return null;
  }

  const loginUrl = getLoginUrl();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Network className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-bold text-foreground">FiberDoc</h1>
            <p className="text-xs text-muted-foreground">Sistema de Documentação de Fibras</p>
          </div>
        </div>
        <Badge variant="outline" className="text-green-400 border-green-400/30 bg-green-400/10">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Sistema instalado
        </Badge>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        {step === 1 && (
          <div className="max-w-3xl w-full text-center space-y-8">
            {/* Hero */}
            <div className="space-y-4">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
                <Network className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-4xl font-bold text-foreground">
                Bem-vindo ao FiberDoc
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                Sistema completo para documentação de infraestrutura de fibras ópticas,
                equipamentos, CEO e topologia de rede.
              </p>
            </div>

            {/* Features grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
              {features.map((f) => (
                <Card key={f.title} className="border-border/50 bg-card/50">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                        <f.icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-semibold text-sm text-foreground">{f.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* CTA */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {user ? (
                <Button size="lg" onClick={() => setStep(2)} className="gap-2">
                  Configurar o sistema
                  <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button size="lg" asChild className="gap-2">
                  <a href={loginUrl}>
                    <Shield className="w-4 h-4" />
                    Entrar para começar
                  </a>
                </Button>
              )}
              <Button size="lg" variant="outline" onClick={() => navigate("/")} className="gap-2">
                Ir para o Dashboard
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-xl w-full space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-foreground">Próximos passos</h2>
              <p className="text-muted-foreground">Siga esta ordem para configurar o sistema rapidamente.</p>
            </div>

            <div className="space-y-3">
              {[
                {
                  n: "1",
                  icon: Database,
                  title: "Cadastrar Salas / Locais",
                  desc: "Crie os locais físicos onde os equipamentos estão instalados (sala de servidores, DG, etc.).",
                  href: "/salas",
                },
                {
                  n: "2",
                  icon: Server,
                  title: "Cadastrar Equipamentos",
                  desc: "Adicione switches, roteadores, OLTs, racks e outros equipamentos com tipo de energia e fonte.",
                  href: "/equipamentos",
                },
                {
                  n: "3",
                  icon: Cable,
                  title: "Cadastrar Portas e Fibras",
                  desc: "Documente as portas de cada equipamento e as fibras ópticas da infraestrutura.",
                  href: "/portas",
                },
                {
                  n: "4",
                  icon: Network,
                  title: "Cadastrar CEO (opcional)",
                  desc: "Adicione caixas de emenda óptica com tubos e vias para documentação completa.",
                  href: "/ceo",
                },
                {
                  n: "5",
                  icon: Smartphone,
                  title: "Configurar App Mobile",
                  desc: "Acesse /mobile no celular e defina senhas mobile para os técnicos em Usuários.",
                  href: "/usuarios",
                },
              ].map((item) => (
                <Card
                  key={item.n}
                  className="border-border/50 hover:border-primary/40 transition-colors cursor-pointer"
                  onClick={() => navigate(item.href)}
                >
                  <CardContent className="p-4 flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">{item.n}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <item.icon className="w-4 h-4 text-muted-foreground" />
                        <span className="font-semibold text-sm text-foreground">{item.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Voltar
              </Button>
              <Button onClick={() => navigate("/")} className="flex-1 gap-2">
                Ir para o Dashboard
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        FiberDoc v1.0 — Sistema de Documentação de Fibras e Equipamentos
      </footer>
    </div>
  );
}
