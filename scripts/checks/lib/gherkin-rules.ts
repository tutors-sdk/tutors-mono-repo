/**
 * A line-based reader for the parts of a Gherkin file the EARS tooling needs:
 * the Feature, its Rule blocks, and the scenarios beneath each Rule, with tags
 * and line numbers. It does not parse steps, tables or doc strings; it only
 * skips them. Bindings and steps are checked by vitest-cucumber when
 * `pnpm test:bdd` runs.
 */

export interface GherkinScenario {
  title: string;
  line: number;
  tags: string[];
  outline: boolean;
}

export interface GherkinRule {
  /** The text after `Rule:`. */
  title: string;
  line: number;
  /** Tags written directly above the `Rule:` line. */
  tags: string[];
  scenarios: GherkinScenario[];
}

export interface GherkinDocument {
  featureName: string | undefined;
  featureLine: number;
  featureTags: string[];
  rules: GherkinRule[];
  /** Scenarios that sit outside any Rule. */
  looseScenarios: GherkinScenario[];
}

const TAG_LINE = /^\s*(@\S+(\s+@\S+)*)\s*(#.*)?$/;
const FEATURE = /^\s*Feature:\s*(.*?)\s*$/;
const RULE = /^\s*Rule:\s*(.*?)\s*$/;
const SCENARIO = /^\s*(Scenario Outline|Scenario Template|Scenario|Example):\s*(.*?)\s*$/;
const DOC_STRING = /^\s*("""|```)/;

export function parseGherkin(text: string): GherkinDocument {
  const doc: GherkinDocument = { featureName: undefined, featureLine: 0, featureTags: [], rules: [], looseScenarios: [] };
  let pendingTags: string[] = [];
  let currentRule: GherkinRule | undefined;
  let inDocString = false;

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (DOC_STRING.test(raw)) {
      inDocString = !inDocString;
      return;
    }
    if (inDocString || raw.trim() === "" || raw.trim().startsWith("#")) return;

    const tagLine = raw.match(TAG_LINE);
    if (tagLine) {
      pendingTags.push(...tagLine[1].split(/\s+/));
      return;
    }

    const feature = raw.match(FEATURE);
    if (feature && doc.featureName === undefined) {
      doc.featureName = feature[1];
      doc.featureLine = line;
      doc.featureTags = pendingTags;
      pendingTags = [];
      return;
    }

    const rule = raw.match(RULE);
    if (rule) {
      currentRule = { title: rule[1], line, tags: pendingTags, scenarios: [] };
      doc.rules.push(currentRule);
      pendingTags = [];
      return;
    }

    const scenario = raw.match(SCENARIO);
    if (scenario) {
      const node: GherkinScenario = { title: scenario[2], line, tags: pendingTags, outline: /Outline|Template/.test(scenario[1]) };
      (currentRule ? currentRule.scenarios : doc.looseScenarios).push(node);
      pendingTags = [];
      return;
    }

    // Background, steps, tables, examples and descriptions carry no tags of their own.
    pendingTags = [];
  });
  return doc;
}

/** The four-digit id of a Rule, `undefined` when it has none, and every tag that looks like an id when it has several or a malformed one. */
export const RULE_ID_TAG = /^@rule-(\d{4})$/;

export function ruleIdTags(rule: Pick<GherkinRule, "tags">): string[] {
  return rule.tags.filter((tag) => /^@rule-/i.test(tag));
}

/** The id (`"0031"`) of a Rule with exactly one well-formed id tag, otherwise `undefined`. */
export function ruleId(rule: Pick<GherkinRule, "tags">): string | undefined {
  const tags = ruleIdTags(rule);
  return tags.length === 1 ? tags[0].match(RULE_ID_TAG)?.[1] : undefined;
}
