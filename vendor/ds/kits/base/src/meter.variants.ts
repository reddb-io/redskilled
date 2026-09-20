import { tv, type VariantProps } from "tailwind-variants";

export const meter = tv({
  slots: {
    root: "flex w-full flex-col gap-[var(--reddb-spatial-gap-sm)] text-foreground",
    summary: "flex items-baseline justify-between gap-[var(--reddb-spatial-gap-md)]",
    label: "text-sm font-medium",
    value: "text-sm tabular-nums text-ink-muted",
    track: "h-2 w-full overflow-hidden rounded-full bg-muted",
    indicator: "h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none",
  },
});

export type MeterVariants = VariantProps<typeof meter>;
