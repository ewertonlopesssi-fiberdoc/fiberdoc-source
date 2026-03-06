import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Retorna informações sobre o papel do usuário autenticado.
 * - isAdmin: true se o usuário tem papel "admin"
 * - isOperator: true se o usuário tem papel "operator" (acesso operacional, sem menus administrativos)
 * - isViewer: true se o usuário tem papel "user" (visualizador)
 * - role: o papel atual ("admin" | "operator" | "user" | undefined)
 */
export function useRole() {
  const { user, loading } = useAuth();

  const role = user?.role as "admin" | "operator" | "user" | undefined;
  const isAdmin = role === "admin";
  const isOperator = role === "operator";
  const isViewer = role === "user";

  return { role, isAdmin, isOperator, isViewer, loading };
}
