<!--
  Textarea — the canonical Base multiline entry.

  It remains a native <textarea>, so rows, wrapping, constraints, validity,
  form submission, events and focus all stay under the platform contract.
-->
<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { textarea } from "./textarea.variants";

  interface Props extends Omit<HTMLTextareaAttributes, "class"> {
    /** The native textarea, available for imperative focus or selection. */
    ref?: HTMLTextAreaElement;
    /** Extra classes, merged over the canonical appearance. */
    class?: string;
  }

  let { ref = $bindable(), class: className, ...rest }: Props = $props();
</script>

<textarea {...rest} bind:this={ref} class={textarea({ class: className })}></textarea>
