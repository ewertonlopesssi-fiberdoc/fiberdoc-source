import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard";
import Equipments from "./pages/Equipments";
import Fibers from "./pages/Fibers";
import Ports from "./pages/Ports";
import Connections from "./pages/Connections";
import Topology from "./pages/Topology";
import History from "./pages/History";
import Rooms from "./pages/Rooms";
import DashboardLayout from "./components/DashboardLayout";

function Router() {
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
