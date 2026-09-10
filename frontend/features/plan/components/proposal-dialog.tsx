"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileDown, ImageDown, Loader2, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import type { PlanVersionView, RequirementCardView } from "@/lib/api/types";
import { exportProposalPdf, exportProposalPng, proposalFilename } from "../export-proposal";
import { CustomerProposal } from "./customer-proposal";

type ExportKind = "pdf" | "png" | null;

export function ProposalDialog({ open, onClose, plan, card }: { open: boolean; onClose: () => void; plan: PlanVersionView; card: RequirementCardView | null }) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<ExportKind>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cities = useMemo(() => Array.from(new Set(plan.structure.days.map((day) => day.city).filter(Boolean))), [plan]);
  const filename = proposalFilename(cities, plan.structure.days[0]?.date ?? "", plan.version);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !exporting) onClose(); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [open, exporting, onClose]);

  if (!open) return null;

  async function run(kind: Exclude<ExportKind, null>) {
    if (!documentRef.current || exporting) return;
    setExporting(kind);
    setError(null);
    try {
      if (kind === "pdf") await exportProposalPdf(documentRef.current, filename, setProgress);
      else await exportProposalPng(documentRef.current, filename, setProgress);
      setProgress(kind === "pdf" ? "PDF 已开始下载" : "长图已开始下载");
    } catch (e) {
      console.error("proposal export failed", e);
      setError(e instanceof Error ? e.message : "导出失败，请重试");
      setProgress("");
    } finally {
      setExporting(null);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#111820]/72 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="客户版方案预览">
      <header className="flex min-h-[68px] items-center gap-3 border-b border-white/10 bg-[#111820] px-4 text-white lg:px-7">
        <div className="min-w-0"><h2 className="truncate text-[16px] font-semibold">客户版方案预览</h2><p className="text-[11px] text-white/55">A4 多页排版 · 已隐藏内部成本轨迹和资源 ID</p></div>
        <div className="ml-auto flex items-center gap-2">
          {progress && <span className="hidden text-[11px] text-white/60 sm:inline" role="status">{progress}</span>}
          <button type="button" disabled={!!exporting} onClick={() => run("pdf")} className="proposal-toolbar-button bg-[#68e477]! text-[#102414]!">
            {exporting === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}<span className="hidden sm:inline">下载 PDF</span>
          </button>
          <button type="button" disabled={!!exporting} onClick={() => run("png")} className="proposal-toolbar-button">
            {exporting === "png" ? <Loader2 className="size-4 animate-spin" /> : <ImageDown className="size-4" />}<span className="hidden sm:inline">下载长图</span>
          </button>
          <button type="button" onClick={onClose} disabled={!!exporting} className="inline-flex size-10 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white" aria-label="关闭客户版预览"><X className="size-5" /></button>
        </div>
      </header>
      {error && <Alert tone="danger" className="mx-auto mt-3 w-[min(92vw,720px)]">{error}</Alert>}
      <div className="flex-1 overflow-auto p-4 lg:p-8">
        <div ref={documentRef} className="mx-auto w-[794px] shadow-[0_28px_90px_rgba(0,0,0,.32)]">
          <CustomerProposal plan={plan} card={card} />
        </div>
      </div>
      <div className="pointer-events-none fixed bottom-5 right-5 hidden items-center gap-2 rounded-full bg-[#111820]/90 px-4 py-2 text-[11px] text-white/70 lg:flex"><Download className="size-3.5" />导出文件包含演示数据声明</div>
    </div>,
    document.body,
  );
}
