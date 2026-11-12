import { defaultCache } from "@serwist/next/worker";
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  Serwist,
  NetworkOnly,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Obrazy (uploady tenantów): Cache-First, nazwy z UUID => niezmienne
      matcher: ({ url }) => url.pathname.startsWith("/api/media/"),
      handler: new CacheFirst({
        cacheName: "gallery-media",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 2000, maxAgeSeconds: 365 * 24 * 3600 }),
        ],
      }),
    },
    {
      // Panel administracyjny odświeża dane z ?fresh=<znacznik> – zawsze aktualne, bez zapisu do cache
      matcher: ({ url }) => /^\/api\/t\/[^/]+\/gallery$/.test(url.pathname) && url.searchParams.has("fresh"),
      handler: new NetworkOnly(),
    },
    {
      // Dane galerii tenanta: pokaż z cache, odśwież w tle
      matcher: ({ url }) => /^\/api\/t\/[^/]+\/gallery$/.test(url.pathname),
      handler: new StaleWhileRevalidate({
        cacheName: "gallery-data",
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      }),
    },
    // Strony (NetworkFirst z fallbackiem do cache), JS/CSS, fonty
    ...defaultCache,
  ],
});

serwist.addEventListeners();
