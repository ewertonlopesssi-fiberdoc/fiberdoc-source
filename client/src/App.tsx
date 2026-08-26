import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Router } from "wouter";
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
import NetworkConfig from "./pages/NetworkConfig";
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
import MapaBeta from "./pages/MapaBeta";
import SgpConfig from "./pages/SgpConfig";
import SshCommander from "./pages/SshCommander";
import CpeManager from "./pages/CpeManager";
import NetworkMonitor from "./pages/NetworkMonitor";
import NetworkEquipmentDetail from "./pages/NetworkEquipmentDetail";
import AdminProviders from "./pages/AdminProviders";
import DashboardLayout from "./components/DashboardLayout";
import NovaVersaoBanner from "./components/NovaVersaoBanner";
import { getTenantSlug } from "./const";

function AppRoutes() {
  // Rota do PWA mobile — sem DashboardLayout
  return (
    <Switch>
      {/* Rotas sem DashboardLayout */}
      <Route path="/mobile" component={MobileApp} />
      <Route path="/mobile/:rest*" component={MobileApp} />
      <Route path="/bem-vindo" component={Welcome} />
      <Route path="/login" component={LocalLogin} />
      <Route path="/alterar-senha">
        <ChangePassword forced />
      </Route>
      <Route path="/relatorio-sala/:id" component={RoomReport} />

      {/* Rotas com DashboardLayout */}
      <Route>
        <DashboardLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/equipamentos" component={Equipments} />
            <Route path="/fibras" component={Fibers} />
            <Route path="/portas" component={Ports} />
            <Route path="/portas/:equipmentId" component={Ports} />
            <Route path="/conexoes" component={Connections} />
            <Route path="/topologia" component={Topology} />
            <Route path="/historico" component={History} />
            <Route path="/salas" component={Rooms} />
            <Route path="/importar" component={Import} />
            <Route path="/relatorio-ocupacao" component={OccupancyReport} />
            <Route path="/ceo" component={Ceos} />
            <Route path="/ceo/:id" component={CeoDetail} />
            <Route path="/cto/:id" component={CtoDetail} />
            <Route path="/busca-porta" component={PortSearch} />
            <Route path="/usuarios" component={Users} />
            <Route path="/backup" component={Backup} />
            <Route path="/sistema" component={SystemSettings} />
            <Route path="/rede" component={NetworkConfig} />
            <Route path="/ip-doc" component={IpDashboard} />
            <Route path="/ip-doc/blocos" component={IpBlocks} />
            <Route path="/ip-doc/blocos/:id" component={IpBlocks} />
            <Route path="/ip-doc/relatorios" component={IpReports} />
            <Route path="/fontes-energia" component={PowerSources} />
            <Route path="/alertas" component={Alerts} />
            <Route path="/sensores-tuya" component={TuyaDevices} />
            <Route path="/cto" component={Ctos} />
            <Route path="/cto/importar" component={CtoImport} />
            <Route path="/mapa" component={InfrastructureMap} />
            <Route path="/mapa2" component={MapaBeta} />
            <Route path="/sgp" component={SgpConfig} />
            <Route path="/ssh-commander" component={SshCommander} />
            <Route path="/cpe-manager" component={CpeManager} />
            <Route path="/monitor-rede" component={NetworkMonitor} />
            <Route path="/monitor-rede/:equipmentId" component={NetworkEquipmentDetail} />
            <Route path="/admin/provedores" component={AdminProviders} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </DashboardLayout>
      </Route>
    </Switch>
  );
}

function App() {
  // Detectar o slug do tenant para configurar o basePath do Wouter
  // Ex: /edivaldofibra/mapa → base="/edivaldofibra", Wouter vê apenas "/mapa"
  const slug = getTenantSlug();
  const base = slug ? `/${slug}` : "";

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster richColors theme="dark" />
          {/* Fica fora do Router: o aviso vale em qualquer tela */}
          <NovaVersaoBanner />
          {/* Router do Wouter com base no slug do tenant */}
          <Router base={base}>
            <AppRoutes />
          </Router>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
