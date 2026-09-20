<!-- A destructive-confirmation overlay composed from the canonical Dialog. -->
<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { alertDialog, alertDialogActions } from "./alert-dialog.variants";
  import Button from "./Button.svelte";
  import Dialog from "./Dialog.svelte";

  type Props = Omit<
    ComponentProps<typeof Dialog>,
    "actions" | "class" | "initialFocus" | "showClose"
  > & {
    /** Visible label for the destructive confirmation action. */
    confirmLabel: string;
    /** Visible label for the safe action. Defaults to `Cancel`. */
    cancelLabel?: string;
    /** Called once when the destructive action is confirmed. */
    onconfirm?: (event: MouseEvent) => void;
    /** Extra classes merged onto the alert surface. */
    class?: string;
  };

  let {
    confirmLabel,
    cancelLabel = "Cancel",
    onconfirm,
    class: className,
    ...dialogProps
  }: Props = $props();

  function confirm(event: MouseEvent, close: () => void): void {
    onconfirm?.(event);
    close();
  }
</script>

{#snippet actions({ close }: { close: () => void })}
  <div data-alert-dialog-actions class={alertDialogActions()}>
    <Button data-alert-dialog-cancel variant="secondary" size="sm" onclick={close}>
      {cancelLabel}
    </Button>
    <Button
      data-alert-dialog-confirm
      variant="primary"
      size="sm"
      onclick={(event: MouseEvent) => confirm(event, close)}
    >
      {confirmLabel}
    </Button>
  </div>
{/snippet}

<Dialog
  {...dialogProps}
  role="alertdialog"
  data-alert-dialog=""
  class={alertDialog({ class: className })}
  {actions}
  initialFocus="actions"
  showClose={false}
/>
