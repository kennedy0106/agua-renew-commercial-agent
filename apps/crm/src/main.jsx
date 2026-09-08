import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { ThemeProvider } from './components/ThemeProvider.jsx';
import { TooltipProvider } from './components/ui/tooltip.jsx';
import { Toaster } from './components/ui/sonner.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <TooltipProvider delayDuration={180}>
        <App />
        <Toaster position="top-right" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
