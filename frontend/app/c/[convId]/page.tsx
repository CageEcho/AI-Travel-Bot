import { Suspense } from "react";
import { Workspace } from "@/features/workspace/workspace";
import Loading from "@/app/loading";

export default async function ConversationPage({ params }: PageProps<"/c/[convId]">) {
  const { convId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <Workspace convId={convId} />
    </Suspense>
  );
}
