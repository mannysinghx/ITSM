import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";

/**
 * Storage abstraction (ADR-6, ADR-10). MVP writes to local disk under STORAGE_DIR;
 * swapping in S3/MinIO later means implementing this interface, not touching callers.
 * Keys are namespaced by tenant so nothing crosses tenant boundaries on disk either.
 */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

const ROOT = resolve(process.env.STORAGE_DIR ?? "./.storage");

class LocalStorage implements Storage {
  async put(key: string, data: Buffer): Promise<void> {
    const path = join(ROOT, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }
  async get(key: string): Promise<Buffer> {
    return readFile(join(ROOT, key));
  }
}

export const storage: Storage = new LocalStorage();

/** Builds a tenant-namespaced storage key for a ticket attachment. */
export function attachmentKey(tenantId: string, ticketId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `tenants/${tenantId}/tickets/${ticketId}/${Date.now()}-${safe}`;
}
