import { tv, type VariantProps } from "tailwind-variants";

export const bottomNavigation = tv({
  slots: {
    root: "w-full border-t border-muted bg-background text-foreground",
    list: [
      "m-0 flex list-none items-stretch gap-[var(--reddb-spatial-gap-sm)] p-0",
      "px-[var(--reddb-spatial-inset-sm)] py-[var(--reddb-spatial-inset-sm)]",
    ].join(" "),
    entry: "min-w-0 flex-1",
    item: "min-h-[var(--reddb-spatial-control-height-lg)] justify-center px-0 text-center",
  },
});

export type BottomNavigationVariants = VariantProps<typeof bottomNavigation>;
