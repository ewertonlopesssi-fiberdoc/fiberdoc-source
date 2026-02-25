import { useAuth } from "@/_core/hooks/useAuth";

/**
 * Retorna informações sobre o papel do usuário autenticado.
 * - isAdmin: true se o usuário tem papel "admin"
 * - isViewer: true se o usuário tem papel "user" (visualizador)
 * - role: o papel atual ("admin" | "user" | undefined)
 */
export function useRole() {
  const { user, loading } = useAuth();

  const role = user?.role as "admin" | "user" | undefined;
  const isAdmin = role === "admin";
  const isViewer = role === "user";

  return { role, isAdmin, isViewer, loading };
}
