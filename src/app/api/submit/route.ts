import { NextResponse } from "next/server";
import { z } from "zod";
import { getBoss } from "@/app/api/queue";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { MAFFT_QUEUE, getJobExpireSeconds, getJobRetryLimit, type MafftJobPayload } from "@/lib/queue";
import { computeJobId, sha256Hex } from "@/lib/hash";
import {
  ACCURATE_STRATEGIES,
  MAX_SEQS_ACCURATE,
  mafftSubmissionSchema,
  type StoredJobParameters,
} from "@/lib/mafft/schema";
import { toCanonicalFasta, validateFasta, type FastaIssue } from "@/lib/sequences/fasta";
import { isEmailConfigured } from "@/lib/email";

const ALLOWED_EXTENSIONS = [".fasta", ".fa", ".fas", ".faa", ".fna", ".ffn", ".fsa", ".txt"];

function badRequest(error: string, extra: Record<string, unknown> = {}, status = 400) {
  return NextResponse.json({ error, ...extra }, { status });
}

type TextField = { ok: true; text: string; filename: string | null } | { ok: false; response: NextResponse };

/**
 * A sequence field may arrive as pasted text (the web form) or as an uploaded
 * file (curl -F sequences=@seqs.fa) - both are accepted.
 */
async function readTextField(form: FormData, name: string, maxBytes: number): Promise<TextField | null> {
  const value = form.get(name);
  if (value === null) return null;
  if (typeof value === "string") {
    if (Buffer.byteLength(value) > maxBytes) {
      return { ok: false, response: badRequest(`'${name}' exceeds the upload size limit`, {}, 413) };
    }
    return value.trim() ? { ok: true, text: value, filename: null } : null;
  }
  if (value.size === 0) return null;
  const lower = value.name.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { ok: false, response: badRequest(`Unsupported file extension for '${name}' (expected FASTA)`) };
  }
  if (value.size > maxBytes) {
    return { ok: false, response: badRequest(`'${name}' exceeds the upload size limit`, {}, 413) };
  }
  return { ok: true, text: await value.text(), filename: value.name };
}

function invalidInput(field: string, errors: FastaIssue[]) {
  return badRequest(`Invalid ${field}: ${errors[0].message}`, { issues: errors });
}

export async function POST(request: Request) {
  const env = getEnv();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Expected multipart/form-data");
  }

  const optionsRaw = form.get("options");
  let optionsJson: unknown = {};
  if (typeof optionsRaw === "string" && optionsRaw.trim()) {
    try {
      optionsJson = JSON.parse(optionsRaw);
    } catch {
      return badRequest("'options' is not valid JSON");
    }
  }
  const parsedOptions = mafftSubmissionSchema.safeParse(optionsJson);
  if (!parsedOptions.success) {
    return badRequest("Invalid options", { issues: parsedOptions.error.issues });
  }
  const options = parsedOptions.data;

  const sequencesField = await readTextField(form, "sequences", env.MAX_UPLOAD_BYTES);
  if (sequencesField && !sequencesField.ok) return sequencesField.response;
  if (!sequencesField) return badRequest("Missing 'sequences'");

  const sequences = validateFasta(sequencesField.text, {
    kind: "sequences",
    // In add mode a single new sequence is the common case.
    minRecords: options.mode === "add" ? 1 : 2,
  });
  if (sequences.errors.length) return invalidInput("sequences", sequences.errors);

  let existingAlignmentFasta: string | undefined;
  let existingCount = 0;
  if (options.mode === "add") {
    const existingField = await readTextField(form, "existingAlignment", env.MAX_UPLOAD_BYTES);
    if (existingField && !existingField.ok) return existingField.response;
    if (!existingField) return badRequest("Add mode needs 'existingAlignment'");
    const existing = validateFasta(existingField.text, { kind: "alignment", minRecords: 2 });
    if (existing.errors.length) return invalidInput("existing alignment", existing.errors);

    const existingIds = new Set(existing.records.map((r) => r.id));
    const clash = sequences.records.find((r) => existingIds.has(r.id));
    if (clash) {
      return badRequest(`'${clash.id}' is in both the existing alignment and the new sequences. Names must be unique.`);
    }
    existingAlignmentFasta = toCanonicalFasta(existing.records, { stripGaps: false });
    existingCount = existing.records.length;
  }

  const totalSequences = sequences.records.length + existingCount;
  if (totalSequences > env.MAX_SEQUENCES) {
    return badRequest(`Too many sequences (${totalSequences}); this server accepts up to ${env.MAX_SEQUENCES}.`);
  }
  if (ACCURATE_STRATEGIES.includes(options.strategy) && totalSequences > MAX_SEQS_ACCURATE) {
    return badRequest(
      `L-INS-i, G-INS-i and E-INS-i are limited to ${MAX_SEQS_ACCURATE} sequences. Use Auto for larger inputs.`,
    );
  }

  const notifyEmailRaw = form.get("notifyEmail");
  let notifyEmail: string | undefined;
  if (typeof notifyEmailRaw === "string" && notifyEmailRaw.trim() !== "") {
    // Defense in depth: the form disables this field entirely when SMTP
    // isn't configured, but reject explicitly here too rather than silently
    // accepting an address nothing will ever email.
    if (!isEmailConfigured()) {
      return badRequest("Email notifications are not configured on this server");
    }
    const parsedEmail = z.email().safeParse(notifyEmailRaw.trim());
    if (!parsedEmail.success) return badRequest("Invalid notification email address");
    notifyEmail = parsedEmail.data;
  }

  const inputFasta = toCanonicalFasta(sequences.records, { stripGaps: true });
  // notifyEmail is per-submission metadata, not part of what makes two
  // submissions "the same job" - deliberately excluded from the id.
  const jobId = computeJobId({ options, inputFasta, existingAlignmentFasta });

  const parameters: StoredJobParameters = {
    options,
    inputSha256: sha256Hex(inputFasta),
    existingAlignmentSha256: existingAlignmentFasta ? sha256Hex(existingAlignmentFasta) : null,
    input: {
      sequenceCount: sequences.records.length,
      minLength: sequences.minLength,
      maxLength: sequences.maxLength,
      detectedType: sequences.detectedType,
    },
  };

  const filenameRaw = form.get("filename");
  const inputFilename =
    sequencesField.filename ??
    (typeof filenameRaw === "string" && filenameRaw.trim() ? filenameRaw.trim().slice(0, 200) : "pasted.fasta");

  const boss = await getBoss();

  const created = await prisma.$transaction(async (tx) => {
    const existingRow = await tx.mafftJob.findUnique({ where: { id: jobId }, select: { id: true } });
    if (existingRow) return false;

    await tx.mafftJob.create({
      data: {
        id: jobId,
        parameters: parameters as object,
        inputFilename,
        inputData: Uint8Array.from(Buffer.from(inputFasta)),
        existingAlnData: existingAlignmentFasta ? Uint8Array.from(Buffer.from(existingAlignmentFasta)) : undefined,
        notifyEmail,
      },
    });
    return true;
  });

  if (created) {
    const payload: MafftJobPayload = { jobId };
    await boss.send(MAFFT_QUEUE, payload, {
      singletonKey: jobId,
      retryLimit: getJobRetryLimit(),
      retryBackoff: true,
      expireInSeconds: getJobExpireSeconds(),
    });
  }

  return NextResponse.json({ jobId }, { status: 201 });
}
