<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    type: string;
    text: string;
    link?: string;
    targetStr?: string;
    onClick?: () => void;
    isActive?: boolean;
  }
  let { type, link, text, targetStr, onClick, isActive = false }: Props = $props();
</script>

<li class="option p-0!">
  {#if link}
    <a
      href={link}
      style={isActive ? 'background-color: var(--ui-selected);' : ''}
      target={targetStr}
    >
      <span class="menu-label">{text}</span>
      <Icon {type} />
    </a>
  {:else}
    <button
      style={isActive ? 'background-color: var(--ui-selected);' : ''}
      onclick={onClick}
    >
      <span class="menu-label">{text}</span>
      <Icon {type} />
    </button>
  {/if}
</li>
