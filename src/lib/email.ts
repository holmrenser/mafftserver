import nodemailer from "nodemailer";
import { getEnv } from "./env";

/**
 * No SMTP host configured means notifications are disabled. This isn't an
 * error by itself - the submission form and /api/submit both refuse a
 * notifyEmail address while this is false (see docs/email-notifications.md),
 * so sendJobNotification below should never actually be called with one in
 * normal operation.
 */
export function isEmailConfigured(): boolean {
  return Boolean(getEnv().SMTP_HOST);
}

let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;

function getTransporter() {
  if (!transporter) {
    const env = getEnv();
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export interface JobNotification {
  to: string;
  jobId: string;
  inputFilename: string;
  outcome: "completed" | "failed";
  errorMessage?: string | null;
}

export function buildJobNotification(params: JobNotification): { subject: string; text: string } {
  const env = getEnv();
  const url = `${env.APP_URL.replace(/\/$/, "")}/jobs/${params.jobId}`;

  const subject =
    params.outcome === "completed"
      ? `MAFFT alignment finished: ${params.inputFilename}`
      : `MAFFT alignment failed: ${params.inputFilename}`;

  const lines = [
    params.outcome === "completed"
      ? `Your MAFFT alignment of "${params.inputFilename}" has finished.`
      : `Your MAFFT alignment of "${params.inputFilename}" failed.`,
    "",
    `View results: ${url}`,
  ];
  if (params.outcome === "failed" && params.errorMessage) {
    lines.push("", `Error: ${params.errorMessage}`);
  }

  return { subject, text: lines.join("\n") };
}

/**
 * Best-effort: a notification failure must never fail the job itself, so
 * every error is logged and swallowed here rather than thrown.
 *
 * Warns (rather than silently returning) when called without SMTP
 * configured - this shouldn't happen given the guards upstream (the
 * submission form disables the field, and /api/submit rejects a
 * notifyEmail if isEmailConfigured() is false), so if it does happen it
 * means a row got a notifyEmail some other way and that's worth knowing
 * about, not swallowing quietly.
 */
export async function sendJobNotification(params: JobNotification): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn(
      `sendJobNotification called for job ${params.jobId} with SMTP unconfigured - skipping. ` +
        "This job's notifyEmail should have been rejected at submission time; see docs/email-notifications.md.",
    );
    return;
  }

  const { subject, text } = buildJobNotification(params);
  try {
    await getTransporter().sendMail({
      from: getEnv().SMTP_FROM,
      to: params.to,
      subject,
      text,
    });
  } catch (err) {
    console.error(`Failed to send job notification email for job ${params.jobId}:`, err);
  }
}
