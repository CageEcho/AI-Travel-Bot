"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="p-8 max-w-lg mx-auto text-center space-y-3">
      <h1 className="text-lg font-semibold">页面出错了</h1>
      <p className="text-muted">刷新或重试通常可以恢复。你的会话和已生成的方案都保存在服务端，不会丢失。</p>
      {error.digest && <p className="text-xs text-muted">错误编号 {error.digest}</p>}
      <Button onClick={reset}>重试</Button>
    </main>
  );
}
