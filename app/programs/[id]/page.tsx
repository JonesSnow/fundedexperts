import type { Metadata } from "next";
import ProgramDetail from "@/components/program-detail";

export const metadata: Metadata = {
  title: "Program Details",
  description: "Review a published simulated trading program and its applicable rules.",
};

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProgramDetail productId={id} />;
}
