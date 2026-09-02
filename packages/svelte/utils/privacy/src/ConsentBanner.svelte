<script lang="ts">
  import { consentState, grantConsent, revokeConsent, setConsentCategory } from "./store.ts";

  let showBanner = $state(false);
  let analytics = $state(false);
  let presence = $state(false);
  let granted = $state(false);

  $effect(() => {
    const unsubscribe = consentState.subscribe((state) => {
      if (!state.granted && !showBanner) {
        showBanner = true;
      }
      analytics = state.preferences.analytics;
      presence = state.preferences.presence;
      granted = state.granted;
    });
    return unsubscribe;
  });

  function handleGrant() {
    grantConsent();
    showBanner = false;
  }

  function handleRevoke() {
    revokeConsent();
    showBanner = false;
  }

  function handleToggleAnalytics(e: Event) {
    const target = e.target as HTMLInputElement;
    setConsentCategory("analytics", target.checked);
  }

  function handleTogglePresence(e: Event) {
    const target = e.target as HTMLInputElement;
    setConsentCategory("presence", target.checked);
  }
</script>

{#if showBanner}
  <div class="consent-overlay" role="dialog" aria-label="Privacy consent">
    <div class="consent-card">
      <h3>Privacy and Data Collection</h3>
      <p>
        Tutors uses Supabase to store learning analytics and presence data.
        You can control what personal data is collected. Essential processing
        (authentication, course content) does not require consent.
      </p>

      <div class="consent-toggle">
        <label>
          <input
            type="checkbox"
            checked={analytics}
            onchange={handleToggleAnalytics}
          />
          Analytics (learning activity, time tracking, calendar data)
        </label>
      </div>

      <div class="consent-toggle">
        <label>
          <input
            type="checkbox"
            checked={presence}
            onchange={handleTogglePresence}
          />
          Presence (online status, real-time collaboration)
        </label>
      </div>

      <div class="consent-actions">
        {#if !granted}
          <button class="btn-accept" onclick={handleGrant}>Accept Selected</button>
        {/if}
        {#if granted}
          <button class="btn-revoke" onclick={handleRevoke}>Withdraw Consent</button>
        {/if}
        <button class="btn-dismiss" onclick={() => showBanner = false}>Dismiss</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .consent-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    z-index: 10000;
    padding: 20px;
  }

  .consent-card {
    background: rgb(var(--color-surface-900));
    border: 1px solid rgb(var(--color-surface-700));
    color: rgb(var(--color-surface-50));
    border-radius: 12px;
    padding: 24px;
    max-width: 520px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  }

  .consent-card h3 {
    margin: 0 0 12px 0;
    font-size: 1.2rem;
  }

  .consent-card p {
    margin: 0 0 16px 0;
    opacity: 0.85;
    line-height: 1.5;
    font-size: 0.9rem;
  }

  .consent-toggle {
    margin: 10px 0;
  }

  .consent-toggle label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }

  .consent-toggle input {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: rgb(var(--color-primary-500));
  }

  .consent-actions {
    display: flex;
    gap: 10px;
    margin-top: 20px;
  }

  .btn-accept {
    background: rgb(var(--color-primary-500));
    color: rgb(var(--color-surface-50));
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 600;
    transition: background 0.2s;
  }

  .btn-accept:hover {
    background: rgb(var(--color-primary-600));
  }

  .btn-revoke {
    background: rgb(var(--color-surface-600));
    color: rgb(var(--color-surface-50));
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 600;
    transition: background 0.2s;
  }

  .btn-revoke:hover {
    background: rgb(var(--color-surface-500));
  }

  .btn-dismiss {
    background: transparent;
    color: rgb(var(--color-surface-300));
    border: 1px solid rgb(var(--color-surface-600));
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.95rem;
    transition: background 0.2s;
  }

  .btn-dismiss:hover {
    background: rgb(var(--color-surface-800));
  }
</style>
