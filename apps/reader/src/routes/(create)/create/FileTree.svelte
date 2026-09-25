<script lang="ts">
  import type { GeneratedFile } from "@tutors/tutors-create/generate";

  type Props = {
    files: GeneratedFile[];
    rootName: string;
  };
  let { files, rootName }: Props = $props();

  interface TreeNode {
    name: string;
    children?: TreeNode[];
    content?: string;
  }

  function buildTree(generated: GeneratedFile[], root: string): TreeNode {
    const tree: TreeNode = { name: root + "/", children: [] };
    for (const file of generated) {
      const parts = file.relativePath.split("/");
      let node = tree;
      parts.forEach((part, i) => {
        const isFile = i === parts.length - 1;
        const name = isFile ? part : part + "/";
        node.children ??= [];
        let child = node.children.find((c) => c.name === name);
        if (!child) {
          child = isFile ? { name, content: file.content } : { name, children: [] };
          node.children.push(child);
        }
        node = child;
      });
    }
    return tree;
  }

  const tree = $derived(buildTree(files, rootName));
</script>

{#snippet renderNode(node: TreeNode, depth: number)}
  <div style="padding-left: {depth * 1.25}rem" class="py-0.5">
    {#if node.children}
      <span class="font-semibold text-[var(--ui-brand)]">{node.name}</span>
      {#each node.children as child}
        {@render renderNode(child, depth + 1)}
      {/each}
    {:else}
      <details><summary class="flex cursor-pointer items-center">{node.name}</summary><pre class="overflow-auto rounded-lg border border-[var(--ui-border)] p-4">{node.content}</pre></details>
    {/if}
  </div>
{/snippet}

{@render renderNode(tree, 0)}
