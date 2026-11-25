import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/inter';
import './styles.css';
import { ApiError } from './api/client';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';

const queryClient: QueryClient = new QueryClient({
  // Η σελίδα πελάτη συγκεντρώνει τα πάντα — μετά από κάθε αλλαγή ξαναφορτώνεται.
  mutationCache: new MutationCache({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer'] }),
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Δεν ξαναδοκιμάζουμε σε 4xx (π.χ. 404/403) — μόνο σε δίκτυο/5xx.
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
