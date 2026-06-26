import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ForbiddenError } from "@/lib/authz";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Maps thrown errors to HTTP responses consistently across routes. */
export function handleError(e: unknown) {
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: e.flatten() },
      { status: 400 },
    );
  }
  if (e instanceof ForbiddenError) {
    return fail(e.message, 403);
  }
  if (e instanceof Error && e.message === "EMAIL_TAKEN") {
    return fail("An account with that email already exists", 409);
  }
  console.error("Unhandled API error:", e);
  return fail("Internal server error", 500);
}
