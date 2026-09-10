"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** 路由内容切换的淡入上移过渡：按 pathname 重挂内容层，外壳（侧栏 / 顶栏）常驻不动。 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="route-enter h-full">{children}</div>;
}
