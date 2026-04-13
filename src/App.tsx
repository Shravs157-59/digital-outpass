/**
 * App.tsx — Root component of the React application.
 * 
 * TYPESCRIPT CONCEPTS:
 * 
 * 1. ARROW FUNCTION with implicit return:
 *    "const App = () => (...)" is an arrow function that returns JSX.
 *    The ": React.FC" type annotation is NOT used here — TypeScript infers the type.
 * 
 * 2. This file has MINIMAL TypeScript — it looks almost identical to plain JavaScript.
 *    The only difference is the file extension (.tsx instead of .jsx).
 *    ".tsx" tells the compiler: "This file contains JSX AND TypeScript."
 */

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
