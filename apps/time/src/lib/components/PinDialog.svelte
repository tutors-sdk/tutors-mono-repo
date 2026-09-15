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
    "transition transition-discrete opacity-0 translate-y-[100px] starting:data-[state=open]:opacity-0 starting:data-[state=open]:translate-y-[100px] data-[state=open]:opacity-100 data-[state=open]:translate-y-0";

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
    <Dialog.Backdrop class="fixed inset-0 z-50 bg-surface-50-950/50 backdrop-blur-sm" />
    <Dialog.Positioner class="fixed inset-0 z-50 flex justify-center items-center p-4">
      <Dialog.Content
        class="card bg-surface-100-900 w-full max-w-md p-6 space-y-4 shadow-xl {animation}"
      >
        <Dialog.Title class="text-2xl font-bold">Enter PIN</Dialog.Title>
        <Dialog.Description class="text-surface-600">
          Please enter the PIN code to continue.
        </Dialog.Description>
        <div class="space-y-4">
          <div>
            <label for="pin-input" class="label">PIN Code</label>
            <input
              id="pin-input"
              type="password"
              bind:value={enteredPin}
              placeholder="Enter PIN"
              class="input w-full"
              onkeydown={(e) => e.key === "Enter" && handleSubmit()}
            />
            {#if error}
              <p class="text-sm text-error-500 mt-1">{error}</p>
            {/if}
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" onclick={handleSubmit} class="btn preset-filled">
              Verify
            </button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Positioner>
  </Portal>
</Dialog>
