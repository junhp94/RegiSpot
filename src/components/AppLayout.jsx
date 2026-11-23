import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import Toast from "./Toast";
import { useState, useEffect } from "react";
import { PAGE } from "../lib/styles";

export default function AppLayout() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const clearToast = () => setToast(null);

  return (
    <div className={PAGE}>
      <TopBar />
      <main className="max-w-[860px] mx-auto px-4 py-6">
        <Toast toast={toast} onClose={clearToast} />
        <Outlet context={{ setToast }} />
      </main>
    </div>
  );
}
