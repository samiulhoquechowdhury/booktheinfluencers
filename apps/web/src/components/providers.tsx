"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { onExternalChange } from "@repo/mock/store";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 } },
      }),
  );

  // Staff changes made in /admin (another tab) show up here without a reload.
  useEffect(() => onExternalChange(() => void client.invalidateQueries()), [client]);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: "font-sans" }} />
    </QueryClientProvider>
  );
}
