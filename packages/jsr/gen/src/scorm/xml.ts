/**
 * A very small read-only XML scanner, sufficient for reading an `imsmanifest.xml`.
 *
 * Tutors has no XML tooling and a SCORM manifest needs only four values read out of it,
 * so a parser is pulled in for nothing. What this does handle is the variation that
 * actually occurs across authoring tools: namespace prefixes on any element or attribute,
 * attributes in either quote style, comments, CDATA, processing instructions and DOCTYPE
 * declarations, and self-closing tags.
 *
 * What it deliberately does not do is validate. Anything malformed yields a partial tree,
 * and it is the caller's job to notice that the values it wanted are missing.
 */

export interface XmlNode {
  /** Element name with any namespace prefix stripped, lower-cased. */
  name: string;
  /** Attributes keyed by prefix-stripped, lower-cased name. */
  attributes: Record<string, string>;
  children: XmlNode[];
  /** Concatenated direct text content. */
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return isNaN(code) ? match : String.fromCodePoint(code);
    }
    return ENTITIES[body.toLowerCase()] ?? match;
  });
}

function localName(name: string): string {
  return name.replace(/^.*:/, "").toLowerCase();
}

/** Locate a tag's closing `>`, ignoring any that appear inside a quoted attribute value. */
function findTagEnd(xml: string, start: number): number {
  let quote = "";
  for (let i = start; i < xml.length; i += 1) {
    const char = xml[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i;
    }
  }
  return -1;
}

const ATTRIBUTE_PATTERN = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTRIBUTE_PATTERN.lastIndex = 0;
  while ((match = ATTRIBUTE_PATTERN.exec(source)) !== null) {
    attributes[localName(match[1])] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

/** Skip a `<!...>` declaration, accounting for the internal subset of a DOCTYPE. */
function skipDeclaration(xml: string, start: number): number {
  const bracket = xml.indexOf("[", start);
  const end = findTagEnd(xml, start);
  if (bracket !== -1 && end !== -1 && bracket < end) {
    const close = xml.indexOf("]", bracket);
    if (close !== -1) {
      const after = findTagEnd(xml, close);
      return after === -1 ? xml.length : after + 1;
    }
  }
  return end === -1 ? xml.length : end + 1;
}

/**
 * Parse a document and return its root element.
 *
 * @returns the root element, or null if the document contains no elements
 */
export function parseXml(xml: string): XmlNode | null {
  const document: XmlNode = { name: "#document", attributes: {}, children: [], text: "" };
  const stack: XmlNode[] = [document];
  let cursor = 0;

  const addText = (value: string) => {
    if (!value.trim()) return;
    const current = stack[stack.length - 1];
    current.text += decodeEntities(value);
  };

  while (cursor < xml.length) {
    const open = xml.indexOf("<", cursor);
    if (open === -1) {
      addText(xml.slice(cursor));
      break;
    }
    addText(xml.slice(cursor, open));

    if (xml.startsWith("<!--", open)) {
      const end = xml.indexOf("-->", open);
      cursor = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", open)) {
      const end = xml.indexOf("]]>", open);
      // CDATA is literal, so it bypasses entity decoding.
      stack[stack.length - 1].text += xml.slice(open + 9, end === -1 ? xml.length : end);
      cursor = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith("<?", open)) {
      const end = xml.indexOf("?>", open);
      cursor = end === -1 ? xml.length : end + 2;
      continue;
    }
    if (xml.startsWith("<!", open)) {
      cursor = skipDeclaration(xml, open);
      continue;
    }

    const end = findTagEnd(xml, open);
    if (end === -1) break;
    const body = xml.slice(open + 1, end);
    cursor = end + 1;

    if (body.startsWith("/")) {
      const closing = localName(body.slice(1).trim());
      // Unwind to the matching element, tolerating tags the document never closed.
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].name === closing) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const selfClosing = body.endsWith("/");
    const content = selfClosing ? body.slice(0, -1) : body;
    const nameMatch = content.match(/^\s*([^\s/>]+)/);
    if (!nameMatch) continue;

    const node: XmlNode = {
      name: localName(nameMatch[1]),
      attributes: parseAttributes(content.slice(nameMatch[0].length)),
      children: [],
      text: "",
    };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }

  return document.children[0] ?? null;
}

/** The first direct child with the given name. */
export function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((candidate) => candidate.name === name);
}

/** Every descendant with the given name, in document order. */
export function descendants(node: XmlNode, name: string): XmlNode[] {
  const found: XmlNode[] = [];
  for (const candidate of node.children) {
    if (candidate.name === name) found.push(candidate);
    found.push(...descendants(candidate, name));
  }
  return found;
}
