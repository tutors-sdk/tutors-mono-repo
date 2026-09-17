<script lang="ts">
  import type { Composite, Lo } from "@tutors/tutors-model-lib";
  import { TreeView, createTreeViewCollection, useTreeView } from "@skeletonlabs/skeleton-svelte";
  import { onMount } from "svelte";
  import LoReference from "./LoReference.svelte";
  import Icon from "./Icon.svelte";
  import { isEducator } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";

  let { lo, expandAll = false }: { lo: Lo; expandAll?: boolean } = $props();

  type Node = { id: string; name: string; lo?: Lo; children?: Node[] };

  function childEntries(item: Lo): Lo[] {
    const toc = item?.toc ?? [];
    if (toc.length > 0) return toc;
    return (item as Composite)?.los ?? [];
  }

  function isVisible(child: Lo): boolean {
    if (isEducator.value) return !child.hide;
    return rbacService.isLoVisibleToStudent(child);
  }

  function mapLoToNode(item: Lo, parentPath: string, index: number): Node | null {
    const thisPath = `${parentPath}/${index}`;
    const entries = childEntries(item);
    const children = entries
      .filter(isVisible)
      .map((child, i) => mapLoToNode(child, thisPath, i))
      .filter((node): node is Node => node !== null);

    if (entries.length > 0 && children.length === 0) return null;

    return {
      id: item.id || item.route || thisPath,
      name: item?.title || "",
      lo: item,
      children,
    };
  }

  const rootChildren = childEntries(lo)
    .filter(isVisible)
    .map((child, i) => mapLoToNode(child, "root", i))
    .filter((node): node is Node => node !== null);

  const collection = createTreeViewCollection<Node>({
    nodeToValue: (node) => node.id,
    nodeToString: (node) => node.name,
    rootNode: { id: "root", name: "", children: rootChildren, lo },
  });

  const id = $props.id();
  const treeView = useTreeView({ id, collection });

  let allExpanded = $state(expandAll);

  onMount(() => {
    if (expandAll) {
      treeView().expand();
      allExpanded = true;
    } else {
      treeView().collapse();
      allExpanded = false;
    }
  });

  function toggleExpandAll() {
    if (allExpanded) {
      treeView().collapse();
    } else {
      treeView().expand();
    }
    allExpanded = !allExpanded;
  }
</script>

<div class="mb-2 flex w-full items-center justify-center gap-2">
  <button class="btn btn-sm border-1" onclick={toggleExpandAll}>
    {#if allExpanded}
      <Icon type="expanded" tip="Collapse all" />
    {:else}
      <Icon type="compacted" tip="Expand all" />
    {/if}
  </button>
</div>

<TreeView.Provider value={treeView}>
  <TreeView.Tree>
    {#each collection.rootNode.children || [] as node, index (node)}
      {@render treeNode(node, [index])}
    {/each}
  </TreeView.Tree>
</TreeView.Provider>

{#snippet treeNode(node: Node, indexPath: number[])}
  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if node.children?.length}
      <TreeView.Branch>
        <TreeView.BranchControl>
          <TreeView.BranchIndicator />
          <TreeView.BranchText class="py-0.5">
            {#if node.lo}
              <LoReference lo={node.lo} />
            {/if}
          </TreeView.BranchText>
        </TreeView.BranchControl>
        <TreeView.BranchContent class="-pl-1">
          <TreeView.BranchIndentGuide />
          {#each node.children as childNode, childIndex (childNode)}
            {@render treeNode(childNode, [...indexPath, childIndex])}
          {/each}
        </TreeView.BranchContent>
      </TreeView.Branch>
    {:else}
      <TreeView.Item class="py-0.5">
        {#if node.lo}
          <LoReference lo={node.lo} />
        {/if}
      </TreeView.Item>
    {/if}
  </TreeView.NodeProvider>
{/snippet}
