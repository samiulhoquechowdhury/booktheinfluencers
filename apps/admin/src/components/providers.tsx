"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { onExternalChange } from "@repo/mock/store";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true, staleTime: 5_000 } } }),
  );
  // Customer actions in another tab (quote accepted, payment, message) refresh the CRM.
  useEffect(() => onExternalChange(() => void client.invalidateQueries()), [client]);
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
