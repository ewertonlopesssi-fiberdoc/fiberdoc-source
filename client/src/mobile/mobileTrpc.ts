import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

// Cliente tRPC para o app mobile — usa URL e token configuráveis
export function createMobileTrpcClient(serverUrl: string, token?: string | null) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${serverUrl}/api/trpc`,
        transformer: superjson,
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : {},
      }),
    ],
  });
}

// Cache offline com IndexedDB
const DB_NAME = "fiberdoc_offline";
const DB_VERSION = 1;

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("cache")) {
        db.createObjectStore("cache", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOfflineCache(key: string, data: unknown) {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction("cache", "readwrite");
    tx.objectStore("cache").put({ key, data, savedAt: Date.now() });
  } catch (e) {
    console.warn("Offline cache write failed:", e);
  }
}

export async function loadOfflineCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openOfflineDb();
    return new Promise((resolve) => {
      const tx = db.transaction("cache", "readonly");
      const req = tx.objectStore("cache").get(key);
      req.onsuccess = () => resolve(req.result?.data ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export function isOnline() {
  return navigator.onLine;
}
