import Link from "next/link";

export default function NotFound() {
  return (
    <main className="p-8 max-w-lg mx-auto text-center space-y-3">
      <h1 className="text-lg font-semibold">找不到这个页面或会话</h1>
      <p className="text-muted">链接可能已失效，或会话不存在。</p>
      <Link href="/" className="text-info underline">返回首页新建会话</Link>
    </main>
  );
}
