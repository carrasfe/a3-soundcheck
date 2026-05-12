"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteContactButton({
  confirmMessage,
  action,
  redirectTo,
}: {
  confirmMessage: string;
  action: () => Promise<{ error: string | null }>;
  redirectTo: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    const result = await action();
    if (result.error) {
      setError(result.error);
      setDeleting(false);
    } else {
      router.push(redirectTo);
    }
  };

  if (confirming) {
    return (
      <div className="rounded-lg border border-[#C0392B]/30 bg-[#C0392B]/5 p-4 space-y-3">
        <p className="text-sm text-gray-700">{confirmMessage}</p>
        {error && <p className="text-xs text-[#C0392B]">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded bg-[#C0392B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Yes, Delete"}
          </button>
          <button
            type="button"
            onClick={() => { setConfirming(false); setError(null); }}
            disabled={deleting}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-gray-400 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-xs font-semibold text-[#C0392B] hover:text-[#a93226] transition"
    >
      Delete
    </button>
  );
}
