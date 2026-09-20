<!-- A visibly named native binary input exposed with switch semantics. -->
<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import Field from "./Field.svelte";
  import { switchControl } from "./switch.variants";

  interface Props extends Omit<HTMLInputAttributes, "children" | "class" | "id" | "required" | "role" | "type"> {
    /** The required visible accessible name supplied through Field. */
    label: string;
    /** Supporting text announced with the switch. */
    help?: string;
    /** Current validation error announced with the switch. */
    error?: string;
    /** Makes the requirement visible and native. */
    required?: boolean;
    /** Explicit control id; otherwise Field supplies a stable generated one. */
    id?: string;
    /** The native input element for rare imperative access. */
    ref?: HTMLInputElement;
    /** Extra classes merged onto the native switch. */
    class?: string;
    /** Extra classes merged onto the containing Field. */
    fieldClass?: string;
  }

  let {
    label,
    help,
    error,
    required = false,
    id,
    ref = $bindable(),
    class: className,
    fieldClass,
    ...rest
  }: Props = $props();
</script>

<Field {label} {help} {error} {required} {id} class={fieldClass}>
  {#snippet children(control)}
    <input
      {...rest}
      {...control}
      bind:this={ref}
      type="checkbox"
      role="switch"
      class={switchControl({ class: className })}
    />
  {/snippet}
</Field>
