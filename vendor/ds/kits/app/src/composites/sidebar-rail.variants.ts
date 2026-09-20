import { tv, type VariantProps } from "tailwind-variants";

/** Token-only rail appearance; SidebarRail.svelte owns focus and selection emission. */
export const sidebarRail = tv({
  slots: {
    root: [
      "flex h-full min-h-0 w-[calc(var(--reddb-spatial-control-height-md)+2*var(--reddb-spatial-inset-sm))] shrink-0 flex-col items-center",
      "gap-[var(--reddb-spatial-gap-sm)] border-e border-elevation-sunken-border bg-elevation-sunken-surface shadow-elevation-sunken",
      "p-[var(--reddb-spatial-inset-sm)] text-foreground",
    ].join(" "),
    region: "flex w-full shrink-0 flex-col items-center gap-[var(--reddb-spatial-gap-sm)]",
    middle: "min-h-0 flex-1 overflow-y-auto",
    list: "m-0 flex w-full list-none flex-col items-center gap-[var(--reddb-spatial-gap-sm)] p-0",
    item: [
      "relative size-[var(--reddb-spatial-control-height-md)] shrink-0 overflow-visible rounded-md border border-transparent p-0",
      "text-sm font-semibold text-ink-muted hover:bg-muted/10 hover:text-foreground",
      "aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
    ].join(" "),
    fallback: "inline-flex size-full items-center justify-center",
  },
});

export type SidebarRailVariants = VariantProps<typeof sidebarRail>;
