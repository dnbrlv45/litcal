"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface AskLitCalContextType {
  open: boolean;
  caseId: string | null;
  openPanel: (caseId?: string) => void;
  closePanel: () => void;
}

const AskLitCalContext = createContext<AskLitCalContextType>({
  open: false,
  caseId: null,
  openPanel: () => {},
  closePanel: () => {},
});

export function AskLitCalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);

  const openPanel = useCallback((id?: string) => {
    if (id) setCaseId(id);
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <AskLitCalContext.Provider value={{ open, caseId, openPanel, closePanel }}>
      {children}
    </AskLitCalContext.Provider>
  );
}

export function useAskLitCal() {
  return useContext(AskLitCalContext);
}
