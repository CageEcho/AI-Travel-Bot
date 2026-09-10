"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** 原生 <dialog>：自带焦点约束、Esc 关闭、遮罩。视觉：白色大圆角浮层。 */
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
      className="m-auto w-[min(92vw,480px)] rounded-(--radius-card) border-0 bg-surface p-0 text-text shadow-(--shadow-float) max-h-[90vh] overflow-auto"
    >
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h2 id="dialog-title" className="text-[17px] font-bold tracking-tight">{title}</h2>
        <button type="button" onClick={onClose} aria-label="关闭" className="icon-btn !w-9 !h-9 !shadow-none bg-surface-2">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="px-6 pb-6">{children}</div>
    </dialog>
  );
}
