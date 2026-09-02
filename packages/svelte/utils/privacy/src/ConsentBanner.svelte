<script lang="ts">
  import { consentState, grantConsent, revokeConsent, setConsentCategory } from "@tutors/privacy";
  import { get } from "svelte/store";

  let showBanner = $state(false);
  let preferences = $state(get(consentState).preferences);

  $effect(() => {
    const unsubscribe = consentState.subscribe((state) => {
      if (!state.granted && !showBanner) {
        showBanner = true;
      }
      preferences = state.preferences;
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

  function handleToggleAnalytics(enabled: boolean) {
    setConsentCategory("analytics", enabled);
    preferences = get(consentState).preferences;
  }

  function handleTogglePresence(enabled: boolean) {
    setConsentCategory("presence", enabled);
    preferences = get(consentState).preferences;
  }
</script>

{#if showBanner}
  <div class="tutors-consent-banner">
    <div class="tutors-consent-banner-content">
      <h3>Privacy & Consent</h3>
      <p>
        We use Supabase to store your learning analytics and presence data.
        You can control what data we track.
      </p>
      
      <div class="tutors-consent-toggle">
        <label>
          <input
            type="checkbox"
            checked={preferences.analytics}
            on:change={(e) => handleToggleAnalytics(e.target.checked)}
          />
          Analytics (learning activity tracking)
        </label>
      </div>
      
      <div class="tutors-consent-toggle">
        <label>
          <input
            type="checkbox"
            checked={preferences.presence}
            on:change={(e) => handleTogglePresence(e.target.checked)}
          />
          Presence (online status & real-time collaboration)
        </label>
      </div>

      {#if !get(consentState).granted}
        <button on:click={handleGrant}>Accept & Enable Tracking</button>
      {/if}
      {#if get(consentState).granted}
        <button class="revoke" on:click={handleRevoke}>Revoke Consent</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .tutors-consent-banner {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: #1a1a2e;
    border-top: 2px solid #e94560;
    color: #fff;
    z-index: 10000;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .tutors-consent-banner-content {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  .tutors-consent-banner-content h3 {
    margin: 0 0 10px 0;
    font-size: 1.2rem;
  }

  .tutors-consent-banner-content p {
    margin: 0 0 15px 0;
    opacity: 0.8;
    line-height: 1.5;
  }

  .tutors-consent-toggle {
    margin: 10px 0;
  }

  .tutors-consent-toggle label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }

  .tutors-consent-toggle input {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  button {
    background: #e94560;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    transition: background 0.2s;
  }

  button:hover {
    background: #d63d54;
  }

  button.revoke {
    background: #6c757d;
  }

  button.revoke:hover {
    background: #5a6268;
  }
</style>
