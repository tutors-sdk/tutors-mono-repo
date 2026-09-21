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
      class="group btn flex w-full justify-between {isActive ? '' : 'hover:preset-tonal'}"
      style={isActive ? 'background-color: var(--ui-selected);' : ''}
      target={targetStr}
    >
      <div class="ml-2">{text}</div>
      <Icon {type} />
    </a>
  {:else}
    <button
      class="group btn flex w-full justify-between {isActive ? '' : 'hover:preset-tonal'}"
      style={isActive ? 'background-color: var(--ui-selected);' : ''}
      onclick={onClick}
    >
      <div class="ml-2">{text}</div>
      <Icon {type} />
    </button>
  {/if}
</li>
