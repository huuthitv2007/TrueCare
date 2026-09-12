import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { setNonce } from "get-nonce";
import { Suspense, lazy, useRef } from "react";
import { ErrorBoundary } from "./ErrorBoundary";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AppState, EmployeeAccount, User } from "../shared/types";
import { AppContext, request, useWorkspace } from "./api";
import { Auth } from "./features/Auth";
const AdminConsole = lazy(() =>
  import("./features/Admin").then((module) => ({
    default: module.AdminConsole,
  })),
);
const Profile = lazy(() =>
  import("./features/Profile").then((module) => ({ default: module.Profile })),
);
const SalesReport = lazy(() =>
  import("./features/SalesReport").then((module) => ({
    default: module.SalesReport,
  })),
);
const Customers = lazy(() =>
  import("./features/Catalog").then((module) => ({
    default: module.Customers,
  })),
);
const Products = lazy(() =>
  import("./features/Catalog").then((module) => ({ default: module.Products })),
);
const Imports = lazy(() =>
  import("./features/Imports").then((module) => ({ default: module.Imports })),
);
const OrderEditor = lazy(() =>
  import("./features/Orders").then((module) => ({
    default: module.OrderEditor,
  })),
);
const Orders = lazy(() =>
  import("./features/Orders").then((module) => ({ default: module.Orders })),
);
import { Button } from "./ui";
import "./styles.css";
import { AppShell } from "./AppShell";
import { Brand } from "./Brand";
const Dashboard = lazy(() =>
  import("./features/WorkspacePages").then((module) => ({
    default: module.Dashboard,
  })),
);
const Inventory = lazy(() =>
  import("./features/WorkspacePages").then((module) => ({
    default: module.Inventory,
  })),
);
const Fund = lazy(() =>
  import("./features/WorkspacePages").then((module) => ({
    default: module.Fund,
  })),
);
const Programs = lazy(() =>
  import("./features/WorkspacePages").then((module) => ({
    default: module.Programs,
  })),
);
const DailyReport = lazy(() =>
  import("./features/WorkspacePages").then((module) => ({
    default: module.DailyReport,
  })),
);

const client = new QueryClient();

function Application() {
  const [session, setSession] = useState<User | null | undefined>(undefined);
  const [state, setState] = useState<AppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [adminTarget, updateAdminTarget] = useState<EmployeeAccount | null>(
    null,
  );
  const workspaceGeneration = useRef(0);
  const refreshSequence = useRef(0);
  const [loadError, setLoadError] = useState("");
  const setAdminTarget = (target: EmployeeAccount | null) => {
    workspaceGeneration.current++;
    refreshSequence.current++;
    setState(null);
    setLoadError("");
    updateAdminTarget(target);
  };
  const [adminReason, setAdminReason] = useState("");
  const refresh = async () => {
    const generation = workspaceGeneration.current;
    const sequence = ++refreshSequence.current;
    try {
      const next = adminTarget
        ? (
            await request<{ state: AppState }>(
              `/api/admin/workspaces/${adminTarget.id}`,
            )
          ).state
        : await request<AppState>("/api/state");
      if (
        generation === workspaceGeneration.current &&
        sequence === refreshSequence.current
      ) {
        setState(next);
        setLoadError("");
      }
    } catch (cause) {
      if (
        generation === workspaceGeneration.current &&
        sequence === refreshSequence.current
      )
        setLoadError((cause as Error).message);
    }
  };
  useEffect(() => {
    request<{ user: User | null }>("/api/auth/session")
      .then((x) => {
        setSession(x.user);
        if (x.user) return refresh();
      })
      .catch(() => setSession(null));
  }, []);
  useEffect(() => {
    const expire = () => {
      setSession(null);
      setState(null);
      setAdminTarget(null);
      setToast("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    };
    window.addEventListener("truecare:session-expired", expire);
    return () => window.removeEventListener("truecare:session-expired", expire);
  }, []);
  useEffect(() => {
    if (session) void refresh();
  }, [adminTarget?.id]);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  };
  const command = async (type: string, payload: unknown) => {
    if (!state) throw new Error("Chưa tải dữ liệu");
    const generation = workspaceGeneration.current;
    setBusy(true);
    try {
      let next: AppState;
      const operation = {
        type,
        payload,
        idempotencyKey: crypto.randomUUID(),
        version: state.version,
        sharedVersion: state.sharedVersion,
        inventoryVersion: state.inventoryVersion,
      };
      if (adminTarget) {
        if (adminReason.trim().length < 3)
          throw new Error(
            "Nhập lý do quản trị trước khi sửa dữ liệu nhân viên",
          );
        next = await request<AppState>(
          `/api/admin/workspaces/${adminTarget.id}/commands`,
          { command: operation, reason: adminReason },
        );
      } else next = await request<AppState>("/api/commands", operation);
      if (generation === workspaceGeneration.current) setState(next);
      return next;
    } finally {
      setBusy(false);
    }
  };
  const workspaceRequest = async <T = any,>(
    path: string,
    body?: unknown,
    method?: string,
  ): Promise<T> => {
    if (!adminTarget) return request<T>(path, body, method);
    const suffix =
      path === "/api/programs/preview"
        ? "programs/preview"
        : path === "/api/imports/preview" || path === "/api/import/preview"
          ? "imports/preview"
          : "";
    if (!suffix)
      throw new Error(
        "Thao tác này chưa hỗ trợ trong không gian nhân viên được chọn",
      );
    return request<T>(
      `/api/admin/workspaces/${adminTarget.id}/${suffix}`,
      body,
      method,
    );
  };
  if (session === undefined)
    return (
      <div className="boot">
        <Brand /> Đang mở TrueCare…
      </div>
    );
  if (!session)
    return (
      <Auth
        onLogin={async () => {
          const x = await request<{ user: User | null }>("/api/auth/session");
          setSession(x.user);
          if (x.user) await refresh();
        }}
      />
    );
  if (!state)
    return (
      <div className="boot">
        {loadError ? (
          <div role="alert">
            <p>{loadError}</p>
            <Button onClick={() => void refresh()}>Thử tải lại</Button>
          </div>
        ) : (
          <>
            <Brand /> Đang tải không gian làm việc…
          </>
        )}
      </div>
    );
  return (
    <AppContext.Provider
      value={{
        state,
        user: session,
        command,
        workspaceRequest,
        refresh,
        notify,
        busy,
        adminTarget,
        setAdminTarget,
        adminReason,
        setAdminReason,
      }}
    >
      <Workspace
        onLogout={async () => {
          await request("/api/auth/logout", {});
          setSession(null);
          setState(null);
          setAdminTarget(null);
        }}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </AppContext.Provider>
  );
}
function Workspace({ onLogout }: { onLogout: () => void }) {
  const { user } = useWorkspace();
  return (
    <AppShell onLogout={onLogout}>
      <Suspense
        fallback={
          <div className="loading-row" role="status">
            Đang tải màn hình…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/admin/*"
            element={
              user.role === "admin" ? (
                <AdminConsole />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/new" element={<OrderEditor />} />
          <Route path="/orders/:id" element={<OrderEditor />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/products" element={<Products />} />
          <Route path="/imports" element={<Imports />} />
          <Route path="/sales" element={<SalesReport mode="ordered" />} />
          <Route path="/delivered" element={<SalesReport mode="delivered" />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/fund" element={<Fund />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/report" element={<DailyReport />} />
          <Route path="/settings" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

const styleNonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
if (styleNonce) setNonce(styleNonce);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <ErrorBoundary>
          <Suspense
            fallback={
              <div role="status" className="boot">
                Đang tải màn hình…
              </div>
            }
          >
            <Application />
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
