import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/auth/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ChatPage } from "@/pages/ChatPage";
import { DocsRagPage } from "@/pages/DocsRagPage";
import { HomePage } from "@/pages/HomePage";
import { MarketplacePage } from "@/pages/MarketplacePage";
import { NodeBuilderPage } from "@/pages/NodeBuilderPage";
import { SkillBuilderPage } from "@/pages/SkillBuilderPage";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/nodes/build" element={<NodeBuilderPage />} />
          <Route path="/skills/build" element={<Navigate to="/skills" replace />} />
          <Route path="/docs/rag" element={<Navigate to="/documents" replace />} />
          <Route element={<AppLayout />}>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/skills" element={<SkillBuilderPage />} />
            <Route path="/documents" element={<DocsRagPage />} />
            <Route path="/marketplace" element={<MarketplacePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
