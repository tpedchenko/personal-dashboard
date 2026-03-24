/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// --- Custom caching rules (prepended before defaultCache) ---
const customRuntimeCaching: RuntimeCaching[] = [
  // Health endpoint — stale-while-revalidate, always have a cached copy
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && pathname === "/api/health",
    method: "GET",
    handler: new StaleWhileRevalidate({
      cacheName: "api-health",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 1,
          maxAgeSeconds: 60 * 60, // 1 hour
        }),
      ],
    }),
  },
  // Monitoring endpoint — stale-while-revalidate
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && pathname === "/api/monitoring",
    method: "GET",
    handler: new StaleWhileRevalidate({
      cacheName: "api-monitoring",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 1,
          maxAgeSeconds: 30 * 60, // 30 min
        }),
      ],
    }),
  },
  // Sync status endpoints — network-first with generous cache
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && pathname.startsWith("/api/sync/"),
    method: "GET",
    handler: new NetworkFirst({
      cacheName: "api-sync",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 16,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        }),
      ],
      networkTimeoutSeconds: 15,
    }),
  },
  // App icons — stale-while-revalidate so updated icons propagate
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin &&
      (pathname.startsWith("/icons/") || pathname === "/PD.png"),
    handler: new StaleWhileRevalidate({
      cacheName: "app-icons",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 32,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        }),
      ],
    }),
  },
  // Next.js static bundles — cache-first (content-hashed filenames)
  {
    matcher: ({ sameOrigin, url: { pathname } }) =>
      sameOrigin && /\/_next\/static\/.+\.(js|css)$/i.test(pathname),
    handler: new CacheFirst({
      cacheName: "next-bundles",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 128,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          maxAgeFrom: "last-used",
        }),
      ],
    }),
  },
];

// Merge custom rules BEFORE defaults so they take priority
const runtimeCaching: RuntimeCaching[] = [
  ...customRuntimeCaching,
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
