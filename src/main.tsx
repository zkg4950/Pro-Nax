import { QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      // Retry transient failures with backoff so a brief network/API blip
      // never turns into a broken screen for the user.
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: { retry: 1 },
  },
});

const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  // Prefetch route code/data on hover so navigation feels instant.
  defaultPreload: "intent",
  defaultPreloadStaleTime: 30_000,
});


declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const app = (
  <RouterProvider router={router} />
);

import { createRoot } from "react-dom/client";
createRoot(rootElement).render(app);
