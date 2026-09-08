"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** 原生 <dialog>：自带焦点约束、Esc 关闭、遮罩。 */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(92vw,480px)] rounded-(--radius-card) border border-border bg-surface p-0 text-text shadow-xl max-h-[90vh] overflow-auto"
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h2 id="dialog-title" className="text-sm font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="关闭" className="p-1 rounded hover:bg-surface-2 min-h-[36px] min-w-[36px] inline-flex items-center justify-center">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}
