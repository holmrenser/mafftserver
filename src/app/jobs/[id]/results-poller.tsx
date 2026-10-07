"use client";

import { useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { BASE_PATH } from "@/lib/basePath";

interface JobStatus {
  done: boolean;
}

/**
 * Client-only polling island (mirrors blastserver's ResultsPoller pattern):
 * polls the lightweight status endpoint with a self-cancelling interval and
 * calls router.refresh() on each tick so the actual results render stays a
 * Server Component. Renders nothing itself, and stops polling for good once
 * the job is done - it never remounts after that.
 */
export function ResultsPoller({ jobId }: { jobId: string }) {
  const router = useRouter();

  useSWR<JobStatus>(`${BASE_PATH}/api/jobs/${jobId}`, fetcher, {
    refreshInterval: (data) => (data?.done ? 0 : 4000),
    onSuccess: (data) => {
      if (data.done) router.refresh();
    },
  });

  return null;
}
