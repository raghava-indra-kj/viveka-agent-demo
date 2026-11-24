import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppRoutes } from './ui/app-routes';
import { createQueryClient } from './ui/query/query-client';
import './ui/styles/globals.css';
const queryClient = createQueryClient();
createRoot(document.getElementById('root')!).render(<StrictMode><QueryClientProvider client={queryClient}><Suspense fallback={null}><BrowserRouter><AppRoutes /></BrowserRouter></Suspense></QueryClientProvider></StrictMode>);
