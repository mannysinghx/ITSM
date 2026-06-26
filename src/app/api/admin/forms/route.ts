import { requireAuth } from "@/lib/auth/require";
import { listForms, createForm } from "@/lib/admin/catalog";
import { formSchema } from "@/lib/catalog/validation";
import { ok, handleError } from "@/lib/api";

export async function GET() {
  try {
    const ctx = await requireAuth();
    return ok({ forms: await listForms(ctx) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const { name, schema } = formSchema.parse(await req.json());
    return ok(await createForm(ctx, name, schema), 201);
  } catch (e) {
    return handleError(e);
  }
}
