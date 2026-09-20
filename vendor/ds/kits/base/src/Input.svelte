<!--
  Input — the canonical Base text entry.

  It stays a native <input>: the complete platform attribute surface is spread
  through, including identity, autofill, constraints, validation, events and
  the native `size` attribute. `ref` is bindable for the rare caller that must
  move focus imperatively; ordinary focus remains the browser's own behavior.
-->
<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { input } from "./input.variants";

  interface Props extends Omit<HTMLInputAttributes, "class"> {
    /** The native input element, available for imperative focus or selection. */
    ref?: HTMLInputElement;
    /** Extra classes, merged over the canonical appearance. */
    class?: string;
  }

  let { ref = $bindable(), class: className, ...rest }: Props = $props();
</script>

<input {...rest} bind:this={ref} class={input({ class: className })} />
