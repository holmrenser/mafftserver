import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/submit/route";
import { prisma } from "@/lib/prisma";
import type { StoredJobParameters } from "@/lib/mafft/schema";
import { PROTEIN, cleanupJobs, createdJobIds, submitRequest } from "./helpers";

afterEach(cleanupJobs);

async function submit(fields: Parameters<typeof submitRequest>[0]) {
  const res = await POST(submitRequest(fields));
  const body = await res.json();
  if (body.jobId) createdJobIds.push(body.jobId);
  return { res, body };
}

describe("POST /api/submit", () => {
  it("creates a job row with canonical input and validated options", async () => {
    const { res, body } = await submit({
      sequences: ">a desc\nMKTAYIAKQR\nQISFVK\n>b\nMKTAYIAKQRQISFVKSHF\n",
      options: JSON.stringify({ strategy: "linsi" }),
    });
    expect(res.status).toBe(201);

    const row = await prisma.mafftJob.findUniqueOrThrow({ where: { id: body.jobId } });
    expect(Buffer.from(row.inputData).toString()).toBe(">a desc\nMKTAYIAKQRQISFVK\n>b\nMKTAYIAKQRQISFVKSHF\n");
    expect(row.inputFilename).toBe("pasted.fasta");
    const params = row.parameters as unknown as StoredJobParameters;
    expect(params.options.strategy).toBe("linsi");
    expect(params.input).toEqual({ sequenceCount: 2, minLength: 16, maxLength: 19, detectedType: "Protein" });
    expect(row.finished).toBeNull();
  });

  it("accepts an uploaded file and keeps its name", async () => {
    const { res, body } = await submit({ sequences: new File([PROTEIN], "mine.fa", { type: "text/plain" }) });
    expect(res.status).toBe(201);
    const row = await prisma.mafftJob.findUniqueOrThrow({ where: { id: body.jobId } });
    expect(row.inputFilename).toBe("mine.fa");
  });

  it("dedupes resubmissions that differ only in formatting", async () => {
    const first = await submit({ sequences: PROTEIN });
    const second = await submit({ sequences: PROTEIN.replace(/\n/g, "\r\n").replace("MKTAYIAKQRQISFVK\r\n", "MKTAYIAKQR\r\nQISFVK\r\n") });
    expect(second.body.jobId).toBe(first.body.jobId);
    expect(await prisma.mafftJob.count({ where: { id: first.body.jobId } })).toBe(1);
  });

  it("rejects invalid sequences with the validator's message", async () => {
    const { res, body } = await submit({ sequences: ">a\nACGT\n>a\nACGA\n" });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/used more than once/);
    expect(body.issues[0].kind).toBe("duplicate-id");
  });

  it("rejects characters MAFFT would silently accept under --preservecase", async () => {
    const { res, body } = await submit({ sequences: ">a\nACGT!\n>b\nACGT\n" });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/'!' is not a valid residue code/);
  });

  it("rejects invalid options", async () => {
    const { res } = await submit({ sequences: PROTEIN, options: JSON.stringify({ strategy: "muscle" }) });
    expect(res.status).toBe(400);
    const bad = await submit({ sequences: PROTEIN, options: "{not json" });
    expect(bad.res.status).toBe(400);
  });

  it("requires an aligned existing alignment with distinct names in add mode", async () => {
    const options = JSON.stringify({ mode: "add" });
    expect((await submit({ sequences: ">n\nMKTAY\n", options })).body.error).toMatch(/existingAlignment/);
    expect(
      (await submit({ sequences: ">n\nMKTAY\n", options, existingAlignment: ">a\nMK-TA\n>b\nMKTA\n" })).body.error,
    ).toMatch(/different lengths/);
    expect(
      (await submit({ sequences: ">a\nMKTAY\n", options, existingAlignment: ">a\nMK-TA\n>b\nMKKTA\n" })).body.error,
    ).toMatch(/in both/);

    const ok = await submit({ sequences: ">n\nMKTAY\n", options, existingAlignment: ">a\nMK-TA\n>b\nMKKTA\n" });
    expect(ok.res.status).toBe(201);
    const row = await prisma.mafftJob.findUniqueOrThrow({ where: { id: ok.body.jobId } });
    expect(Buffer.from(row.existingAlnData!).toString()).toBe(">a\nMK-TA\n>b\nMKKTA\n");
  });

  it("rejects a notification email while SMTP isn't configured", async () => {
    const { res, body } = await submit({ sequences: PROTEIN, notifyEmail: "someone@example.com" });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not configured/);
  });
});
