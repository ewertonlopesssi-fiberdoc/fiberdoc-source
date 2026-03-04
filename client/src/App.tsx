import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import MobileApp from "./mobile/MobileApp";
import Dashboard from "./pages/Dashboard";
import Equipments from "./pages/Equipments";
import Fibers from "./pages/Fibers";
import Ports from "./pages/Ports";
import Connections from "./pages/Connections";
import Topology from "./pages/Topology";
import History from "./pages/History";
import Rooms from "./pages/Rooms";
import Import from "./pages/Import";
import Ceos from "./pages/Ceos";
import CeoDetail from "./pages/CeoDetail";
import CtoDetail from "./pages/CtoDetail";
import PortSearch from "./pages/PortSearch";
import Users from "./pages/Users";
import Backup from "./pages/Backup";
import SystemSettings from "./pages/SystemSettings";
import OccupancyReport from "./pages/OccupancyReport";
import RoomReport from "./pages/RoomReport";
import Welcome from "./pages/Welcome";
import LocalLogin from "./pages/LocalLogin";
import ChangePassword from "./pages/ChangePassword";
import IpDashboard from "./pages/IpDashboard";
import IpBlocks from "./pages/IpBlocks";
import IpReports from "./pages/IpReports";
import PowerSources from "./pages/PowerSources";
import Alerts from "./pages/Alerts";
import TuyaDevices from "./pages/TuyaDevices";
import Ctos from "./pages/Ctos";
import CtoImport from "./pages/CtoImport";
import InfrastructureMap from "./pages/InfrastructureMap";
import SgpConfig from "./pages/SgpConfig";
import SshCommander from "./pages/SshCommander";
import DashboardLayout from "./components/DashboardLayout";

function Router() {
  // Rota do PWA mobile — sem DashboardLayout
  if (window.location.pathname.startsWith("/mobile")) {
    return <MobileApp />;
  }

  // Rota de boas-vindas — sem DashboardLayout
  if (window.location.pathname === "/bem-vindo") {
    return <Welcome />;
  }
  // Rota de login local — sem DashboardLayout
  if (window.location.pathname === "/login") {
    return <LocalLogin />;
  }
  // Rota de alteração de senha — sem DashboardLayout
  if (window.location.pathname === "/alterar-senha") {
    return <ChangePassword forced />;
  }

  // Relatório de sala via QR Code — sem DashboardLayout (acesso público)
  if (window.location.pathname.startsWith("/relatorio-sala")) {
    return (
      <Switch>
        <Route path="/relatorio-sala/:id" component={RoomReport} />
      </Switch>
    );
  }

  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Dashboard} />
        <Route path={"/equipamentos"} component={Equipments} />
        <Route path={"/fibras"} component={Fibers} />
        <Route path={"/portas"} component={Ports} />
        <Route path={"/portas/:equipmentId"} component={Ports} />
        <Route path={"/conexoes"} component={Connections} />
        <Route path={"/topologia"} component={Topology} />
        <Route path={"/historico"} component={History} />
        <Route path={"/salas"} component={Rooms} />
        <Route path={"/importar"} component={Import} />
        <Route path={"/relatorio-ocupacao"} component={OccupancyReport} />
        <Route path={"/ceo"} component={Ceos} />
        <Route path={"/ceo/:id"} component={CeoDetail} />
        <Route path={"/cto/:id"} component={CtoDetail} />
        <Route path={"/busca-porta"} component={PortSearch} />
        <Route path={"/usuarios"} component={Users} />
        <Route path={"/backup"} component={Backup} />
        <Route path={"/sistema"} component={SystemSettings} />
        <Route path={"/ip-doc"} component={IpDashboard} />
        <Route path={"/ip-doc/blocos"} component={IpBlocks} />
        <Route path={"/ip-doc/blocos/:id"} component={IpBlocks} />
        <Route path={"/ip-doc/relatorios"} component={IpReports} />
        <Route path={"/fontes-energia"} component={PowerSources} />
        <Route path={"/alertas"} component={Alerts} />
        <Route path={"/sensores-tuya"} component={TuyaDevices} />
        <Route path={"/cto"} component={Ctos} />
        <Route path={"/cto/importar"} component={CtoImport} />
        <Route path={"/mapa"} component={InfrastructureMap} />
        <Route path={"/sgp"} component={SgpConfig} />
        <Route path={"/ssh-commander"} component={SshCommander} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors theme="dark" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
