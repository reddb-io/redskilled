import { tv, type VariantProps } from "tailwind-variants";

/** Token-only modal surface appearance; behavior remains in Dialog.svelte. */
export const dialog = tv({
  base: [
    "m-auto w-full max-w-lg rounded-lg border border-elevation-overlay-border bg-elevation-overlay-surface text-foreground shadow-elevation-overlay",
    "p-[var(--reddb-spatial-inset-lg)]",
    "focus:outline-none",
    "backdrop:bg-foreground/50",
    "motion-safe:transition-opacity motion-reduce:transition-none",
  ].join(" "),
});

export type DialogVariants = VariantProps<typeof dialog>;
