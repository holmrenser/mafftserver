// Shared SWR fetcher for the client-side pollers (queue badge, results poller).
// Throws a `DataFetchError` (carrying the response body + status) on a
// non-2xx response so SWR surfaces it as `error`.

export class DataFetchError extends Error {
  info: unknown = undefined;
  status: number | undefined = undefined;
}

export async function fetcher(url: string) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const error = new DataFetchError("An error occurred while fetching the data.");
    error.info = await res.json().catch(() => undefined);
    error.status = res.status;
    throw error;
  }
  return res.json();
}
