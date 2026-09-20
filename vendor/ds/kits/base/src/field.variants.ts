// Field's public association and appearance seams.
//
// The association object is deliberately control-agnostic: Field can own the
// accessible contract for the canonical Input or for a consumer's explicitly
// named local control without either implementation reaching into the other.

import { tv, type VariantProps } from "tailwind-variants";

export interface FieldControlProps {
  /** The id the label targets. */
  id: string;
  /** Native required semantics, when the Field declares them. */
  required?: true;
  /** Space-separated help and error ids. */
  "aria-describedby"?: string;
  /** Present only while the Field has an error. */
  "aria-invalid"?: "true";
  /** The Field's current error id. */
  "aria-errormessage"?: string;
}

export const field = tv({
  slots: {
    root: "grid gap-[var(--reddb-spatial-gap-sm)]",
    label: "text-sm font-medium text-foreground",
    required: "ms-[var(--reddb-spatial-gap-sm)] text-foreground",
    help: "text-sm text-ink-muted",
    error: "text-sm font-medium text-foreground",
  },
});

export type FieldVariants = VariantProps<typeof field>;
