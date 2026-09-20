import { tv, type VariantProps } from "tailwind-variants";

/** Native-link appearance with a persistent non-colour affordance. */
export const link = tv({
  base: [
    "text-primary-text underline decoration-current underline-offset-[var(--reddb-spatial-gap-sm)]",
    "hover:decoration-2",
    "focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
  ].join(" "),
});

export type LinkVariants = VariantProps<typeof link>;
