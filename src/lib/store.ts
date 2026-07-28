import { create } from "zustand";

export type Route = "home" | "settings" | "account";

type UIState = {
  route: Route;
  setRoute: (r: Route) => void;
};

export const useUI = create<UIState>((set) => ({
  route: "home",
  setRoute: (route) => set({ route }),
}));

export type ToastTone = "info" | "success" | "error";
export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastState = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id"> & { id?: string; durationMs?: number }) => string;
  dismiss: (id: string) => void;
};

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: ({ id, durationMs = 6000, ...rest }) => {
    const tid = id ?? crypto.randomUUID();
    set((s) => ({
      toasts: [...s.toasts.filter((t) => t.id !== tid), { id: tid, ...rest }],
    }));
    if (durationMs > 0) {
      setTimeout(() => get().dismiss(tid), durationMs);
    }
    return tid;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
