import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import {
  AppErrorBoundary,
  AppErrorFallback,
} from "./components/app-error-boundary";
import "./index.css";
import { initTelemetry } from "./lib/telemetry";
const router = createBrowserRouter([
  { path: "*", element: <App />, errorElement: <AppErrorFallback /> },
]);
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5000, refetchOnWindowFocus: false },
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  </React.StrictMode>,
);
void initTelemetry();
