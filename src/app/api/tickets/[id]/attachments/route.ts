import { requireAuth } from "@/lib/auth/require";
import { addAttachment } from "@/lib/tickets/service";
import { storage, attachmentKey } from "@/lib/storage";
import { ok, fail, handleError } from "@/lib/api";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB MVP cap

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("No file provided", 400);
    if (file.size > MAX_BYTES) return fail("File too large (max 10MB)", 413);

    const bytes = Buffer.from(await file.arrayBuffer());
    const key = attachmentKey(ctx.tenantId, id, file.name);
    await storage.put(key, bytes);

    const att = await addAttachment(ctx, id, {
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      byteSize: file.size,
      storageKey: key,
    });
    return ok({ id: att.id, filename: att.filename }, 201);
  } catch (e) {
    return handleError(e);
  }
}
