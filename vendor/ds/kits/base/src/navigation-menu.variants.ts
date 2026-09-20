import { tv, type VariantProps } from "tailwind-variants";

export const navigationMenu = tv({
  slots: {
    root: "relative flex max-w-max items-center",
    list: "flex list-none items-center gap-[var(--reddb-spatial-gap-sm)]",
    control: [
      "inline-flex items-center rounded-md px-[var(--reddb-spatial-inset-md)] text-foreground outline-none",
      "hover:bg-muted/10 focus-visible:ring-2 focus-visible:ring-primary",
      "data-[state=open]:bg-muted/15 aria-[current=page]:font-semibold",
    ].join(" "),
    content: "min-w-64",
    links: "grid list-none gap-[var(--reddb-spatial-gap-sm)]",
    link: "block rounded-md p-[var(--reddb-spatial-inset-sm)] text-foreground outline-none hover:bg-muted/10 focus-visible:ring-2 focus-visible:ring-primary",
    description: "mt-1 block text-sm text-ink-muted",
  },
  variants: {
    orientation: {
      horizontal: { list: "flex-row" },
      vertical: { list: "flex-col items-stretch" },
    },
    size: {
      sm: { control: "h-[var(--reddb-spatial-control-height-sm)] text-sm" },
      md: { control: "h-[var(--reddb-spatial-control-height-md)] text-sm" },
      lg: { control: "h-[var(--reddb-spatial-control-height-lg)] text-base" },
    },
  },
  defaultVariants: { orientation: "horizontal", size: "md" },
});

export type NavigationMenuVariants = VariantProps<typeof navigationMenu>;
export type NavigationMenuOrientation = NonNullable<NavigationMenuVariants["orientation"]>;
export type NavigationMenuSize = NonNullable<NavigationMenuVariants["size"]>;
