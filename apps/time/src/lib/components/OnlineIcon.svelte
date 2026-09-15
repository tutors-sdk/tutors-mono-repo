<script lang="ts" module>
  export const ONLINE_ICONS = {
    online: { type: "twemoji:green-circle", color: "success" },
    offline: { type: "twemoji:black-circle", color: "secondary" },
  } as const;

  export type OnlinePresence = keyof typeof ONLINE_ICONS;

  function bgClass(color: string): string {
    return color.startsWith("bg-") ? color : `bg-${color}`;
  }

  /** Case-insensitive: `"online"` → online; anything else → offline. */
  export function normalizeOnlineStatus(raw: string | null | undefined): OnlinePresence {
    return String(raw ?? "").trim().toLowerCase() === "online" ? "online" : "offline";
  }
</script>

<script lang="ts">
  import Icon from "@iconify/svelte";

  interface Props {
    /** Typically `"online"` or `"offline"` from tutors-connect-users (other values show as offline). */
    status: string | null | undefined;
    /** Tailwind size utility for the icon, e.g. `size-6`, `size-8`. */
    size?: string;
    class?: string;
    /** Overrides the default accessible label */
    label?: string;
  }

  let { status, size = "size-10", class: className = "", label }: Props = $props();

  const presence = $derived(normalizeOnlineStatus(status));
  const config = $derived(ONLINE_ICONS[presence]);
  const background = $derived(bgClass(config.color));
  const ariaLabel = $derived(label ?? (presence === "online" ? "Online" : "Offline"));
</script>

<span
  class="inline-flex items-center justify-center rounded-full p-0.5 {background} {className}"
  role="img"
  aria-label={ariaLabel}
>
  <Icon icon={config.type} class="shrink-0 {size}" aria-hidden="true" />
</span>
