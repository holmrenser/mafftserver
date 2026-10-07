"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "@/lib/fetcher";
import { BASE_PATH } from "@/lib/basePath";

interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export function QueueStatus() {
  const { data, isLoading, error } = useSWR<QueueCounts>(`${BASE_PATH}/api/queue`, fetcher, {
    refreshInterval: 5_000,
    revalidateOnMount: true,
  });

  if (error) {
    return <span className="text-sm text-destructive">Queue status unavailable</span>;
  }
  if (isLoading || !data) {
    return <Skeleton className="h-5 w-64" />;
  }

  const { waiting, active, completed, failed } = data;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary" className="gap-1.5">
        <span className="size-2 rounded-full bg-amber-500" />
        {waiting} waiting
      </Badge>
      <Badge variant="secondary" className="gap-1.5">
        <span className="size-2 rounded-full bg-blue-500" />
        {active} running
      </Badge>
      <Badge variant="secondary" className="gap-1.5">
        <span className="size-2 rounded-full bg-emerald-500" />
        {completed} completed
      </Badge>
      {failed > 0 && (
        <Badge variant="secondary" className="gap-1.5">
          <span className="size-2 rounded-full bg-red-500" />
          {failed} failed
        </Badge>
      )}
    </div>
  );
}
