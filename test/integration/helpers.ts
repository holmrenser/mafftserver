import { prisma } from "@/lib/prisma";

export const PROTEIN = ">a\nMKTAYIAKQRQISFVK\n>b\nMKTAYIAKQRQISFVKSHF\n>c\nMKSAYIAKQRQLSFVK\n";

export function submitRequest(fields: Record<string, string | File | undefined>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.set(key, value);
  }
  return new Request("http://localhost/api/submit", { method: "POST", body: form });
}

/** Tracks job rows a test created so afterEach can remove them. */
export const createdJobIds: string[] = [];

export async function cleanupJobs() {
  if (createdJobIds.length > 0) {
    await prisma.mafftJob.deleteMany({ where: { id: { in: createdJobIds } } });
    createdJobIds.length = 0;
  }
}
