<!-- A modal Dialog with a DS-owned trigger, labeling, and dismissal contract. -->
<script module lang="ts">
  let dialogSequence = 0;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLDialogAttributes } from "svelte/elements";
  import { button } from "./button.variants";
  import { dialog as dialogAppearance } from "./dialog.variants";

  interface Props extends Omit<HTMLDialogAttributes, "aria-describedby" | "aria-labelledby" | "class" | "open"> {
    /** Accessible name for the control that opens the Dialog. */
    triggerLabel: string;
    /** Visible Dialog title and its accessible name. */
    title: string;
    /** Optional visible detail associated with the Dialog. */
    description?: string;
    /** Optional custom trigger content; `triggerLabel` remains its accessible name. */
    trigger?: Snippet;
    /** Dialog body. */
    children?: Snippet;
    /** Optional action region with the canonical close operation. */
    actions?: Snippet<[{ close: () => void }]>;
    /** Where focus enters when the Dialog opens. Defaults to its body. */
    initialFocus?: "body" | "actions";
    /** Whether to render the standard close control. Defaults to true. */
    showClose?: boolean;
    /** Extra classes merged onto the modal surface. */
    class?: string;
  }

  const instanceId = `reddb-dialog-${++dialogSequence}`;
  const titleId = `${instanceId}-title`;
  const descriptionId = `${instanceId}-description`;

  let {
    triggerLabel,
    title,
    description,
    trigger,
    children,
    actions,
    initialFocus = "body",
    showClose = true,
    class: className,
    ...rest
  }: Props = $props();
  let dialog: HTMLDialogElement;
  let returnFocus: HTMLElement | null = null;

  const focusableSelector = [
    "button:not([disabled])",
    "a[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  function openDialog(): void {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    const preferredRegion = initialFocus === "actions" ? "[data-dialog-actions]" : "[data-dialog-body]";
    (
      dialog.querySelector<HTMLElement>(`${preferredRegion} ${focusableSelector}`) ??
      dialog.querySelector<HTMLElement>(focusableSelector) ??
      dialog
    ).focus();
  }

  function closeDialog(): void {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    returnFocus?.focus();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      dialog.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<button
  type="button"
  data-dialog-trigger
  aria-label={triggerLabel}
  class={button({ variant: "secondary", size: "sm" })}
  onclick={openDialog}
>
  {#if trigger}{@render trigger()}{:else}{triggerLabel}{/if}
</button>

<dialog
  bind:this={dialog}
  {...(rest as Record<string, unknown>)}
  aria-modal="true"
  aria-labelledby={titleId}
  aria-describedby={description ? descriptionId : undefined}
  class={dialogAppearance({ class: className })}
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <h2 id={titleId} data-dialog-title class="text-lg font-semibold">{title}</h2>
  {#if description}
    <p id={descriptionId} data-dialog-description class="mt-[var(--reddb-spatial-gap-sm)] text-ink-muted">
      {description}
    </p>
  {/if}
  {#if showClose}
    <button
      type="button"
      data-dialog-close
      aria-label={`Close ${title}`}
      class={button({ variant: "ghost", size: "sm" })}
      onclick={closeDialog}>×</button
    >
  {/if}
  {#if children}
    <div data-dialog-body class="mt-[var(--reddb-spatial-gap-lg)]">{@render children()}</div>
  {/if}
  {#if actions}
    <div data-dialog-actions>{@render actions({ close: closeDialog })}</div>
  {/if}
</dialog>
