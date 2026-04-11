"use client";

import { useState } from "react";
import type { ScorecardData } from "@/lib/generate-scorecard-pdf";

interface Props {
  data: ScorecardData;
  className?: string;
  children?: React.ReactNode;
}

export default function DownloadPDFButton({ data, className, children }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { downloadScorecardPDF } = await import("@/lib/generate-scorecard-pdf");
      downloadScorecardPDF(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={handleClick} disabled={loading} className={className}>
      {loading ? "Generating…" : (children ?? "Download PDF")}
    </button>
  );
}
