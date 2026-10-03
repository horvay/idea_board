import { createContext, useContext, useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { useMediaQuery, cn } from "../lib/hooks";
import { Sidebar } from "./Sidebar";
import { Home } from "./Home";
import { DocPage } from "./DocPage";
import { ToastProvider } from "./Toast";

type ShellCtx = { sidebarOpen: boolean; toggleSidebar: () => void; isWide: boolean };
const Ctx = createContext<ShellCtx>({ sidebarOpen: true, toggleSidebar: () => {}, isWide: true });
export const useShell = () => useContext(Ctx);

export function Shell({ onSwitchUser }: { onSwitchUser: () => void }) {
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [sidebarOpen, setSidebarOpen] = useState(isWide);
  const [location] = useLocation();

  useEffect(() => setSidebarOpen(isWide), [isWide]);
  // On narrow screens the sidebar is a drawer; close it after navigating.
  useEffect(() => {
    if (!isWide) setSidebarOpen(false);
  }, [location, isWide]);

  const toggleSidebar = () => setSidebarOpen((o) => !o);

  return (
    <Ctx.Provider value={{ sidebarOpen, toggleSidebar, isWide }}>
      <ToastProvider>
      <div className="flex h-full overflow-hidden">
        {isWide ? (
          <aside
            className={cn(
              "shrink-0 overflow-hidden border-r border-line bg-sidebar transition-[width] duration-200",
              sidebarOpen ? "w-72" : "w-0 border-r-0",
            )}
          >
            <div className="h-full w-72">
              <Sidebar onSwitchUser={onSwitchUser} />
            </div>
          </aside>
        ) : (
          <>
            <div
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] transition-opacity",
                sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            />
            <aside
              className={cn(
                "fixed inset-y-0 left-0 z-50 w-[min(20rem,85vw)] bg-sidebar transition-transform duration-200",
                sidebarOpen ? "translate-x-0 shadow-float" : "-translate-x-full",
              )}
            >
              <Sidebar onSwitchUser={onSwitchUser} />
            </aside>
          </>
        )}
        <main className="relative min-w-0 flex-1">
          <Switch>
            <Route path="/d/:id">{(p) => <DocPage key={p.id} docId={p.id} />}</Route>
            <Route>
              <Home />
            </Route>
          </Switch>
        </main>
      </div>
      </ToastProvider>
    </Ctx.Provider>
  );
}
