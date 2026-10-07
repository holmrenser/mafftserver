import { JobSubmissionForm } from "@/components/forms/job-submission-form";
import { isEmailConfigured } from "@/lib/email";
import { getEnv } from "@/lib/env";

// isEmailConfigured() and getEnv() read real runtime env - without this, Next would
// statically prerender the page once at build time and freeze emailEnabled
// and the worker thread count at whatever they were then.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">mafftserver</h1>
        <p className="text-sm text-muted-foreground">Align nucleotide or protein sequences with MAFFT.</p>
      </div>
      <JobSubmissionForm emailEnabled={isEmailConfigured()} workerThreads={getEnv().MAFFT_WORKER_THREADS} />
    </main>
  );
}
