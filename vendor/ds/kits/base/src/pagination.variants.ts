import { tv, type VariantProps } from "tailwind-variants";

export const pagination = tv({
  slots: {
    root: "text-foreground",
    list: "m-0 flex list-none flex-wrap items-center gap-[var(--reddb-spatial-gap-sm)] ps-0",
    page: [
      "inline-flex h-[var(--reddb-spatial-control-height-sm)] min-w-[var(--reddb-spatial-control-height-sm)]",
      "items-center justify-center rounded-md border border-muted px-[var(--reddb-spatial-inset-sm)]",
      "aria-[current=page]:border-primary aria-[current=page]:font-semibold",
    ].join(" "),
  },
});

export type PaginationVariants = VariantProps<typeof pagination>;
