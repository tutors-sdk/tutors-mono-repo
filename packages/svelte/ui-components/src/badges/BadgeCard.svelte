<script lang="ts">
  import { badgeImageDataUri, shareLinks, shareText, type BadgeDefinition } from "@tutors/badges";

  interface Props {
    badge: BadgeDefinition;
    courseTitle: string;
    issuerName: string;
    issuedAt: Date;
    credentialId: string;
    /** The public page that shows this badge; share links point there. */
    pageUrl: string;
  }

  let { badge, courseTitle, issuerName, issuedAt, credentialId, pageUrl }: Props = $props();

  let shareable = $derived({ badgeTitle: badge.title, courseTitle, issuerName, issuedAt, credentialId, pageUrl });
  let links = $derived(shareLinks(shareable));
  let image = $derived(badgeImageDataUri(badge, courseTitle));
  let awarded = $derived(issuedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }));
  let canShare = $state(false);
  let copied = $state(false);

  $effect(() => {
    canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  });

  async function share() {
    try {
      await navigator.share({ title: `${badge.title} badge`, text: shareText(shareable), url: pageUrl });
    } catch {
      // The student closed the share sheet; nothing to do.
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }
</script>

<article class="ui-panel badge-card" aria-labelledby="badge-{badge.id}-title">
  <img class="badge-image" src={image} alt="{badge.title} badge, {courseTitle}" width="120" height="160" />
  <div class="badge-body">
    <h3 id="badge-{badge.id}-title">{badge.title}</h3>
    <p class="ui-muted">{courseTitle} · awarded {awarded}</p>
    {#if badge.description}<p>{badge.description}</p>{/if}
    <div class="badge-actions" role="group" aria-label="Share this badge">
      {#if canShare}<button type="button" class="ui-button ui-button-primary" onclick={share}>Share</button>{/if}
      <a class="ui-button" href={links.linkedinAddToProfile} target="_blank" rel="noopener noreferrer">Add to LinkedIn profile</a>
      <a class="ui-button" href={links.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
      <a class="ui-button" href={links.x} target="_blank" rel="noopener noreferrer">X</a>
      <a class="ui-button" href={links.bluesky} target="_blank" rel="noopener noreferrer">Bluesky</a>
      <a class="ui-button" href={links.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
      <button type="button" class="ui-button" onclick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>
    </div>
  </div>
</article>

<style>
  .badge-card {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: flex-start;
  }
  .badge-image {
    width: 120px;
    height: auto;
    flex: none;
  }
  .badge-body {
    flex: 1 1 16rem;
    display: grid;
    gap: 0.5rem;
  }
  .badge-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
