"use client";

import type { MouseEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function ConfirmSubmitButton({
  children,
  confirmation,
  pendingLabel = "Excluindo…",
  className,
}: {
  children: ReactNode;
  confirmation: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  function confirmSubmission(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmation)) event.preventDefault();
  }

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={confirmSubmission}
      className={className}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
