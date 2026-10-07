import Link from "next/link";
import { QueueStatus } from "./queue-status";

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <nav className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-4 px-4 py-2" aria-label="main navigation">
        <Link href="/" className="text-base font-bold">
          mafftserver
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Queue</span>
          <QueueStatus />
        </div>
      </nav>
    </header>
  );
}
