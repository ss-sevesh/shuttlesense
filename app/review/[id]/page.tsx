import { notFound } from "next/navigation";
import { SavedAnalysisReview } from "@/components/analysis-job";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id)) notFound();
  return <SavedAnalysisReview key={id} id={id}/>;
}
