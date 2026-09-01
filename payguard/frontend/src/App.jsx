import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Dashboard from "./pages/Dashboard";
import AttackSimulator from "./pages/AttackSimulator";
import AuditLog from "./pages/AuditLog";
import HumanApprovals from "./pages/HumanApprovals";
import AIBuyer from "./pages/AIBuyer";

export default function App() {
  return (
    <BrowserRouter>
      <div className="bg-background text-on-surface min-h-screen">
        <Sidebar />
        <TopBar />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {/* remaining routes added as each screen is converted */}
          <Route path="/attack-simulator" element={<AttackSimulator />} />;
          <Route path="/audit-log" element={<AuditLog />} />
          <Route path="/human-approvals" element={<HumanApprovals />} />;
          <Route path="/ai-buyer" element={<AIBuyer />} />;
        </Routes>
      </div>
    </BrowserRouter>
  );
}
