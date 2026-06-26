import { ArticleView } from "@/components/knowledge/ArticleView";

export default async function KnowledgeArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ArticleView id={id} />;
}
