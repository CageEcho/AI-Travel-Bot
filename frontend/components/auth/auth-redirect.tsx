"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** API 客户端不依赖 React；收到 401 时用事件交给路由层跳转登录页。 */
export function AuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    const redirect = () => router.replace("/login");
    window.addEventListener("travel:auth-required", redirect);
    return () => window.removeEventListener("travel:auth-required", redirect);
  }, [router]);
  return null;
}
