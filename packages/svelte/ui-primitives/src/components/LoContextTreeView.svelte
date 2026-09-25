<script lang="ts">
  import type { Composite, Lo } from "@tutors/tutors-model-lib";
  import { TreeView, createTreeViewCollection, useTreeView } from "@skeletonlabs/skeleton-svelte";
  import { page } from "$app/state";
  import LoReference from "./LoReference.svelte";
  import Icon from "./Icon.svelte";
  import { isEducator } from "@tutors/runes";
  import { rbacService } from "@tutors/rbac";
  import { t } from "@tutors/i18n";

  let { lo, expandAll = false }: { lo: Lo; expandAll?: boolean } = $props();

  type Node = { id: string; name: string; lo?: Lo; children?: Node[] };

  function childEntries(item: Lo): Lo[] {
    const toc = item?.toc ?? [];
    if (toc.length > 0) return toc;
    return (item as Composite)?.los ?? [];
  }

  /** Titles can carry inline markup (LoReference renders them as HTML); accessible names are plain text. */
  function plainText(html: string): string {
    return html.replace(/<[^>]*>/g, "").trim();
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

  function currentBranches() {
    const ancestors: string[] = [];
    function containsCurrent(node: Node): boolean {
      const childIsCurrent = node.children?.map(containsCurrent).some(Boolean);
      if (childIsCurrent) ancestors.push(node.id);
      return !!childIsCurrent || (!!node.lo && !["unit", "side"].includes(node.lo.type) && page.url.pathname === node.lo.route);
    }
    rootChildren.forEach(containsCurrent);
    return ancestors;
  }

  const id = $props.id();
  const treeView = useTreeView({ id, collection, defaultExpandedValue: expandAll ? collection.getBranchValues() : currentBranches() });
  const allExpanded = $derived(treeView().expandedValue.length === collection.getBranchValues().length);

  function toggleExpandAll() {
    if (allExpanded) {
      treeView().collapse();
    } else {
      treeView().expand();
    }
  }
</script>

<div class="course-tree">
  {#if lo.type === "course"}
    <a class="tree-overview" href={lo.route} aria-current={page.url.pathname === lo.route ? "page" : undefined}>
      <Icon icon="lucide:book-open" height="20" />
      <span>Course overview</span>
    </a>
  {/if}
  <div class="tree-toolbar">
    <span class="ui-eyebrow">Contents</span>
    <button class="ui-button" onclick={toggleExpandAll} aria-label={allExpanded ? t("nav.context.collapseAll") : t("nav.context.expandAll")}>
      <Icon icon={allExpanded ? "lucide:chevrons-down-up" : "lucide:chevrons-up-down"} height="16" />
      {allExpanded ? t("nav.context.collapseAll") : t("nav.context.expandAll")}
    </button>
  </div>
  <TreeView.Provider value={treeView}>
    <TreeView.Tree class="course-tree-items" aria-label="Course contents">
      {#each collection.rootNode.children || [] as node, index (node)}
        {@render treeNode(node, [index])}
      {/each}
    </TreeView.Tree>
  </TreeView.Provider>
</div>

{#snippet treeNode(node: Node, indexPath: number[])}
  <TreeView.NodeProvider value={{ node, indexPath }}>
    {#if node.children?.length}
      <TreeView.Branch>
        {#if node.lo && ["unit", "side"].includes(node.lo.type)}
          <TreeView.BranchControl class="tree-section" aria-label={`${t("a11y.tree.toggle")}: ${plainText(node.name)}`}>
            <Icon icon="lucide:folder" height="20" />
            <TreeView.BranchText class="tree-section-title">{plainText(node.name)}</TreeView.BranchText>
            <span class="tree-count" aria-label={`${node.children.length} items`}>{node.children.length}</span>
            <TreeView.BranchIndicator class="tree-chevron" />
          </TreeView.BranchControl>
        {:else}
          <div class="tree-branch-row">
            <TreeView.BranchText class="tree-section-title">
              {#if node.lo}<LoReference lo={node.lo} />{/if}
            </TreeView.BranchText>
            <TreeView.BranchControl class="tree-toggle" aria-label={`${t("a11y.tree.toggle")}: ${plainText(node.name)}`}>
              <TreeView.BranchIndicator class="tree-chevron" />
            </TreeView.BranchControl>
          </div>
        {/if}
        <TreeView.BranchContent class="tree-children">
          {#each node.children as childNode, childIndex (childNode)}
            {@render treeNode(childNode, [...indexPath, childIndex])}
          {/each}
        </TreeView.BranchContent>
      </TreeView.Branch>
    {:else}
      <TreeView.Item class="tree-leaf">
        {#if node.lo}<LoReference lo={node.lo} />{/if}
      </TreeView.Item>
    {/if}
  </TreeView.NodeProvider>
{/snippet}

<style>
  .tree-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-block: var(--space-5) var(--space-3); }
  .tree-toolbar .ui-button { font-size: var(--font-caption); }
  .tree-overview { display: flex; align-items: center; gap: var(--space-3); min-height: 44px; padding: var(--space-3); border-radius: var(--radius-control); font-size: var(--font-label); color: var(--ui-ink); }
  .tree-overview:hover, .tree-overview[aria-current] { background: var(--ui-selected); }
  .tree-overview[aria-current] { box-shadow: inset 3px 0 var(--ui-brand); font-weight: var(--weight-semibold); }
  .course-tree :global(.course-tree-items) { display: grid; width: 100%; gap: var(--space-1); outline: none; }
  .course-tree :global([data-part="branch"]) { width: 100%; }
  .course-tree :global(.tree-section), .course-tree :global(.tree-toggle) { display: flex; align-items: center; min-height: 44px; gap: var(--space-3); padding: var(--space-3); margin: 0; border-radius: var(--radius-control); color: var(--ui-ink); background: transparent; font-size: var(--font-label); }
  .course-tree :global(.tree-section) { display: grid; grid-template-columns: 20px minmax(0, 1fr) 3ch 20px; width: 100%; text-align: left; }
  .course-tree :global(.tree-section:hover), .course-tree :global(.tree-toggle:hover) { background: var(--ui-selected); }
  .course-tree :global(.tree-section-title) { min-width: 0; flex: 1; overflow-wrap: anywhere; font-weight: var(--weight-medium); }
  .tree-count { text-align: right; color: var(--ui-muted); font-size: var(--font-caption); font-variant-numeric: tabular-nums; }
  .course-tree :global(.tree-chevron) { display: grid; place-items: center; width: 20px; height: 20px; flex-shrink: 0; color: var(--ui-muted); }
  .course-tree :global(.tree-chevron > svg) { display: block; width: 20px; height: 20px; }
  .tree-branch-row { display: flex; gap: var(--space-1); align-items: center; }
  .course-tree :global(.tree-toggle) { width: 44px; justify-content: center; flex-shrink: 0; }
  .course-tree :global(.tree-children) { margin: var(--space-1) 0 var(--space-2) var(--space-5); padding-left: var(--space-3); border-left: 1px solid var(--ui-border); }
  .course-tree :global(.tree-children > *) { margin-block: var(--space-1); }
  .course-tree :global(.tree-leaf) { display: block; padding: 0; margin: 0; background: transparent; border-radius: var(--radius-control); }
  .course-tree :global(.tree-leaf:hover) { background: transparent; }
</style>
