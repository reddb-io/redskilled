// ToggleGroup's public option contract and token-only group appearance seam.
import { tv, type VariantProps } from "tailwind-variants";

export interface ToggleGroupOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export const toggleGroup = tv({
  slots: {
    root: "min-w-0",
    list: [
      "inline-flex flex-nowrap items-center gap-0 overflow-hidden rounded-md",
      "border border-[var(--reddb-color-border-strong)]",
      "divide-x divide-[var(--reddb-color-border-strong)]",
      "p-[var(--reddb-spatial-inset-sm)]",
    ].join(" "),
    option: [
      "h-[var(--reddb-spatial-control-height-md)] rounded-none border-0",
      "px-[var(--reddb-spatial-inset-sm)] leading-normal",
    ].join(" "),
  },
});

export type ToggleGroupVariants = VariantProps<typeof toggleGroup>;
