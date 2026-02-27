import { Outlet } from "react-router-dom";
import TopBar from "./TopBar";
import Toast from "./Toast";
import { useState, useEffect } from "react";

export default function AppLayout() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const clearToast = () => setToast(null);

  return (
    <div className="min-h-screen py-7 px-4 bg-gradient-to-br from-bg2 via-transparent to-transparent bg-bg1 text-text dark:bg-dark-bg1 dark:text-dark-text">
      <div className="max-w-[980px] mx-auto">
        <TopBar />
        <Toast toast={toast} onClose={clearToast} />
        <Outlet context={{ setToast }} />
        <div className="mt-4 text-xs text-slate-900/45 dark:text-slate-400/55">
          <span>Serverless: API Gateway · Lambda · DynamoDB</span>
        </div>
      </div>
    </div>
  );
}
