import Link from "next/link";
import type { ReactNode } from "react";
import { Compass } from "lucide-react";

export function AppShell({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-ink text-white">
        <div className="mx-auto max-w-[1600px] px-4 lg:px-6 h-12 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-[15px]">
            <Compass className="size-5" aria-hidden="true" />
            行策
          </Link>
          <span className="hidden sm:inline text-xs text-white/60">高端旅行智能方案生成平台 · M0</span>
          <nav className="ml-4 hidden md:flex items-center gap-1 text-sm">
            <Link href="/" className="px-2 py-1 rounded hover:bg-white/10">工作台</Link>
            <Link href="/search" className="px-2 py-1 rounded hover:bg-white/10">手动检索</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs text-white/80">{right}</div>
        </div>
      </header>
      <main className="flex-1 min-h-0 mx-auto w-full max-w-[1600px] px-3 lg:px-6 py-3">{children}</main>
      <footer className="px-4 py-1.5 text-[11px] text-muted text-right">资源数据为模拟数据集，非真实供应商信息。</footer>
    </div>
  );
}
