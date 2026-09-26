<script lang="ts">
  import { Dialog, Portal } from "@skeletonlabs/skeleton-svelte";

  const STORAGE_KEY_PREFIX = "tutors-time-pin-verified-";

  interface Props {
    /** Whether the dialog is open */
    open: boolean;
    /** The correct PIN to verify against */
    pin: string;
    /** Optional key for session persistence. When set, verified state is stored in sessionStorage. */
    sessionKey?: string;
    /** Called when the correct PIN is entered (or already verified for sessionKey) */
    onVerified?: () => void;
  }

  let { open, pin, sessionKey, onVerified }: Props = $props();

  let enteredPin = $state("");
  let error = $state<string | null>(null);
  let alreadyVerified = $state(false);

  const animation =
    "transition transition-discrete opacity-0 translate-y-2 starting:data-[state=open]:opacity-0 starting:data-[state=open]:translate-y-2 data-[state=open]:opacity-100 data-[state=open]:translate-y-0";

  function isVerifiedForSession(key: string): boolean {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(STORAGE_KEY_PREFIX + key) === "1";
  }

  function setVerifiedForSession(key: string): void {
    sessionStorage?.setItem(STORAGE_KEY_PREFIX + key, "1");
  }

  $effect(() => {
    if (open) {
      if (sessionKey && isVerifiedForSession(sessionKey)) {
        alreadyVerified = true;
        onVerified?.();
      } else {
        alreadyVerified = false;
        enteredPin = "";
        error = null;
      }
    }
  });

  function handleSubmit() {
    const trimmed = enteredPin.trim();
    if (!trimmed) {
      error = "Please enter a PIN";
      return;
    }

    if (trimmed === String(pin ?? "").trim()) {
      error = null;
      if (sessionKey) setVerifiedForSession(sessionKey);
      onVerified?.();
    } else {
      error = "Incorrect PIN. Please try again.";
    }
  }
</script>

<Dialog {open} closeOnInteractOutside={false} closeOnEscape={false}>
  <Portal>
    <Dialog.Backdrop class="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--ui-canvas)_70%,transparent)]" />
    <Dialog.Positioner class="fixed inset-0 z-50 flex justify-center items-center p-4">
      <Dialog.Content
        class="ui-panel w-full max-w-md space-y-4 shadow-[0_12px_32px_#0000001a] {animation}"
      >
        <Dialog.Title class="ui-section-title">Enter PIN</Dialog.Title>
        <Dialog.Description class="text-[var(--ui-muted)]">
          Please enter the PIN code to continue.
        </Dialog.Description>
        <div class="space-y-4">
          <div>
            <label for="pin-input" class="ui-label">PIN code</label>
            <input
              id="pin-input"
              type="password"
              bind:value={enteredPin}
              placeholder="Enter PIN"
              class="input w-full"
              onkeydown={(e) => e.key === "Enter" && handleSubmit()}
            />
            {#if error}
              <p role="alert" class="mt-1 text-sm text-[var(--ui-danger)]">{error}</p>
            {/if}
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" onclick={handleSubmit} class="ui-button ui-button-primary">
              Verify
            </button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog>
