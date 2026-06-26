import { CatalogForm } from "@/components/catalog/CatalogForm";

export default async function CatalogItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <CatalogForm itemId={itemId} />;
}
