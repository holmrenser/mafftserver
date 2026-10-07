import { afterEach, describe, expect, it } from "vitest";
import { GET as getJob } from "@/app/api/jobs/[id]/route";
import { GET as download } from "@/app/api/jobs/[id]/download/route";
import { GET as queue } from "@/app/api/queue/route";
import { prisma } from "@/lib/prisma";
import { cleanupJobs, createdJobIds } from "./helpers";

afterEach(cleanupJobs);

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const ALIGNMENT = ">human\nMGD-VEK\n>yeast\nMGDAVEK\n";

async function finishedJob(id: string) {
  createdJobIds.push(id);
  await prisma.mafftJob.create({
    data: {
      id,
      parameters: {},
      inputFilename: "x.fasta",
      inputData: Uint8Array.from(Buffer.from(">human\nMGDVEK\n>yeast\nMGDAVEK\n")),
      started: new Date(),
      finished: new Date(),
      alignmentFasta: ALIGNMENT,
      guideTreeNewick: "(human:0.1,yeast:0.1);",
      resultsZip: Uint8Array.from(Buffer.from("PK-fake")),
      resultsZipBytes: 7,
    },
  });
}

describe("GET /api/jobs/[id]", () => {
  it("returns 404 for an unknown job", async () => {
    expect((await getJob(new Request("http://localhost"), params("nope"))).status).toBe(404);
  });

  it("reports done without returning heavy columns", async () => {
    await finishedJob("itest-status-000000000001");
    const body = await (await getJob(new Request("http://localhost"), params("itest-status-000000000001"))).json();
    expect(body.done).toBe(true);
    expect(body).not.toHaveProperty("alignmentFasta");
  });
});

describe("GET /api/jobs/[id]/download", () => {
  const get = (id: string, format?: string) =>
    download(new Request(`http://localhost/api/jobs/${id}/download${format ? `?format=${format}` : ""}`), params(id));

  it("serves each alignment format as an attachment, rendered from the stored FASTA", async () => {
    const id = "itest-download-0000000001";
    await finishedJob(id);

    const fasta = await get(id, "fasta");
    expect(await fasta.text()).toBe(ALIGNMENT);
    expect(fasta.headers.get("content-disposition")).toBe(`attachment; filename="mafft-${id}.fasta"`);

    expect(await (await get(id, "phylip")).text()).toBe(" 2 7\nhuman  MGD-VEK\nyeast  MGDAVEK\n");
    expect(await (await get(id, "clustal")).text()).toMatch(/^CLUSTAL/);
    expect(await (await get(id, "newick")).text()).toBe("(human:0.1,yeast:0.1);\n");

    const zip = await get(id);
    expect(zip.headers.get("content-type")).toBe("application/zip");
    expect(zip.headers.get("content-length")).toBe("7");
  });

  it("rejects unknown formats and 404s for jobs without results", async () => {
    await finishedJob("itest-download-0000000002");
    expect((await get("itest-download-0000000002", "toString")).status).toBe(400);
    expect((await get("nope", "fasta")).status).toBe(404);
  });
});

describe("GET /api/queue", () => {
  it("returns non-negative counts for every state", async () => {
    const body = await (await queue()).json();
    for (const key of ["waiting", "active", "completed", "failed"]) {
      expect(body[key]).toBeGreaterThanOrEqual(0);
    }
  });
});
