import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || 200;

interface LoItem {
  type: string;
  title: string;
  depth: number;
}

interface LoNode {
  type: string;
  title: string;
  route: string;
  children: LoNode[];
  parent: LoNode | null;
}

function buildLoTree(items: LoItem[]): LoNode[] {
  if (items.length === 0) return [];

  const roots: LoNode[] = [];
  const stack: LoNode[] = [];

  for (const item of items) {
    const node: LoNode = {
      type: item.type,
      title: item.title,
      route: `/${item.type}-${item.title.replace(/\s+/g, "-").toLowerCase()}`,
      children: [],
      parent: null
    };

    while (stack.length > 0 && stack.length > item.depth) {
      stack.pop();
    }

    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      node.parent = parent;
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    stack.push(node);
  }

  return roots;
}

function countNodes(nodes: LoNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count += 1 + countNodes(node.children);
  }
  return count;
}

function maxDepth(nodes: LoNode[], current: number = 0): number {
  if (nodes.length === 0) return current;
  return Math.max(...nodes.map((n) => maxDepth(n.children, current + 1)));
}

const loItemArb = fc.record({
  type: fc.constantFrom("topic", "unit", "side", "lab", "talk", "note", "video", "web", "github", "archive"),
  title: fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => s.trim().length > 0),
  depth: fc.integer({ min: 0, max: 5 })
});

describe("LO Tree Construction — Property-Based Tests", () => {
  it("should preserve total node count", () => {
    fc.assert(
      fc.property(fc.array(loItemArb, { maxLength: 30 }), (items) => {
        const tree = buildLoTree(items);
        expect(countNodes(tree)).toBe(items.length);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("should respect depth bound", () => {
    fc.assert(
      fc.property(fc.array(loItemArb, { minLength: 1, maxLength: 30 }), (items) => {
        const tree = buildLoTree(items);
        const maxInputDepth = Math.max(...items.map((i) => i.depth));
        expect(maxDepth(tree)).toBeLessThanOrEqual(maxInputDepth + 1);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("should maintain correct parent references", () => {
    fc.assert(
      fc.property(fc.array(loItemArb, { maxLength: 30 }), (items) => {
        const tree = buildLoTree(items);
        function checkParents(nodes: LoNode[], expectedParent: LoNode | null) {
          for (const node of nodes) {
            expect(node.parent).toBe(expectedParent);
            checkParents(node.children, node);
          }
        }
        checkParents(tree, null);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("should generate valid routes for all nodes", () => {
    fc.assert(
      fc.property(fc.array(loItemArb, { maxLength: 30 }), (items) => {
        const tree = buildLoTree(items);
        function checkRoutes(nodes: LoNode[]) {
          for (const node of nodes) {
            expect(node.route).toBeTruthy();
            expect(node.route.startsWith("/")).toBe(true);
            checkRoutes(node.children);
          }
        }
        checkRoutes(tree);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("should return empty array for empty input", () => {
    const tree = buildLoTree([]);
    expect(tree).toEqual([]);
  });

  it("should produce flat list when all items are at depth 0", () => {
    fc.assert(
      fc.property(
        fc.array(loItemArb.map((item) => ({ ...item, depth: 0 })), { minLength: 1, maxLength: 20 }),
        (items) => {
          const tree = buildLoTree(items);
          expect(tree.length).toBe(items.length);
          for (const node of tree) {
            expect(node.children).toHaveLength(0);
            expect(node.parent).toBeNull();
          }
        }
      ),
      { numRuns: FUZZ_RUNS }
    );
  });
});
