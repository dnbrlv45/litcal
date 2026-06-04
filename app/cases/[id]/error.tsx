"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CaseDetailError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Case detail error:", error);
  }, [error]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      <p className="text-sm font-medium text-destructive">Something went wrong loading this case.</p>
      <pre className="text-xs text-muted-foreground bg-muted rounded p-3 max-w-lg overflow-auto whitespace-pre-wrap">
        {error.message || "Unknown error"}
        {error.digest ? `\n\nDigest: ${error.digest}` : ""}
      </pre>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={unstable_retry}>Try again</Button>
        <Link href="/cases"><Button variant="ghost" size="sm">Back to Cases</Button></Link>
      </div>
    </div>
  );
}
