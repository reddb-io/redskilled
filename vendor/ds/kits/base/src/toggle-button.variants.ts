// ToggleButton extends canonical Button appearance with a perceivable pressed state.
import { tv, type VariantProps } from "tailwind-variants";

export const toggleButton = tv({
  base: [
    "aria-pressed:bg-primary aria-pressed:text-on-primary",
    "aria-pressed:border-primary",
  ].join(" "),
  variants: {
    pressed: {
      true: "font-semibold",
      false: "",
    },
  },
  defaultVariants: { pressed: false },
});

export type ToggleButtonVariants = VariantProps<typeof toggleButton>;
