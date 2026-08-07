<script lang="ts" module>
  export const SENTIMENT_ICONS = {
    neutral: { type: "twemoji:dizzy", color: "bg-base-content" },
    fine: { type: "twemoji:slightly-smiling-face", color: "bg-base-content" },
    delighted: { type: "twemoji:grinning-face-with-big-eyes", color: "success" },
    confident: { type: "twemoji:flexed-biceps", color: "primary" },
    overwhelmed: { type: "twemoji:exploding-head", color: "warning" },
    confused: { type: "twemoji:face-with-spiral-eyes", color: "secondary" },
    drained: { type: "twemoji:melting-face", color: "error" },
  } as const;

  export type Sentiment = keyof typeof SENTIMENT_ICONS;

  function bgClass(color: string): string {
    return color.startsWith("bg-") ? color : `bg-${color}`;
  }
</script>

<script lang="ts">
  import Icon from "@iconify/svelte";

  interface Props {
    sentiment: Sentiment;
    /** Tailwind size utility for the icon, e.g. `size-6`, `size-8`, `size-10`. */
    size?: string;
    /** Extra classes on the outer badge */
    class?: string;
    /** Accessible label; defaults to the sentiment key */
    label?: string;
  }

  let {
    sentiment,
    size = "size-10",
    class: className = "",
    label,
  }: Props = $props();

  const config = $derived(SENTIMENT_ICONS[sentiment]);
  const background = $derived(bgClass(config.color));
  const ariaLabel = $derived(label ?? sentiment);
</script>

<span
  class="inline-flex items-center justify-center rounded-full p-0.5 {background} {className}"
  role="img"
  aria-label={ariaLabel}
>
  <Icon icon={config.type} class="shrink-0 {size}" aria-hidden="true" />
</span>
