// Tabs' token-only appearance seam; Bits UI owns selection and roving focus.
import { tv, type VariantProps } from "tailwind-variants";

export interface TabItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export const tabs = tv({
  slots: {
    root: "min-w-0",
    list: "flex flex-wrap gap-[var(--reddb-spatial-gap-sm)] border-b border-muted",
    trigger: [
      "h-[var(--reddb-spatial-control-height-sm)] rounded-b-none",
      "data-[state=active]:border-primary data-[state=active]:text-foreground",
      "data-[state=inactive]:text-ink-muted",
    ].join(" "),
    content: [
      "py-[var(--reddb-spatial-inset-md)] text-foreground",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    ].join(" "),
  },
});

export type TabsVariants = VariantProps<typeof tabs>;
