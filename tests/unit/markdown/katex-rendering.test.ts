import { describe, it, expect } from "vitest";
import { markdownIt } from "../../../packages/jsr/model/src/utils/markdown-utils";

/**
 * Tests for KaTeX math rendering via @mdit/plugin-katex.
 * Validates inline math, display math, accessibility output,
 * and edge cases for the markdown-it + katex pipeline.
 */
describe("KaTeX Math Rendering", () => {
  describe("inline math", () => {
    it("shall render inline math with single dollar delimiters", () => {
      const result = markdownIt.render("$E=mc^2$");
      expect(result).toContain('class="katex"');
      expect(result).toContain("E");
      expect(result).toContain("mc");
    });

    it("shall render inline math with variables and fractions", () => {
      const result = markdownIt.render(
        "The equation $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$ is quadratic."
      );
      expect(result).toContain('class="katex"');
      expect(result).toContain("The equation");
    });

    it("shall not render dollar signs in regular text as math", () => {
      const result = markdownIt.render("The price is $5 and $10.");
      // Single $ followed by a digit and space should NOT be treated as math
      expect(result).not.toContain('class="katex"');
    });
  });

  describe("display math", () => {
    it("shall render display math with double dollar delimiters", () => {
      const result = markdownIt.render("$$\\sum_{i=1}^n x_i$$");
      expect(result).toContain('class="katex"');
    });

    it("shall render multiline display math", () => {
      const md = "$$\n\\int_0^\\infty e^{-x} dx = 1\n$$";
      const result = markdownIt.render(md);
      expect(result).toContain('class="katex"');
    });
  });

  describe("accessibility", () => {
    it("shall include MathML for screen readers", () => {
      const result = markdownIt.render("$a^2 + b^2 = c^2$");
      expect(result).toContain("katex-mathml");
      expect(result).toContain("<math");
    });

    it("shall include aria-hidden on visual rendering", () => {
      const result = markdownIt.render("$x^2$");
      expect(result).toContain('aria-hidden="true"');
    });
  });

  describe("edge cases", () => {
    it("shall handle Greek letters", () => {
      const result = markdownIt.render("$\\alpha + \\beta = \\gamma$");
      expect(result).toContain('class="katex"');
    });

    it("shall handle matrices", () => {
      const result = markdownIt.render(
        "$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$"
      );
      expect(result).toContain('class="katex"');
    });

    it("shall handle mixed content with math and regular markdown", () => {
      const md =
        "# Heading\n\nSome text with $E=mc^2$ inline math.\n\n$$F = ma$$\n\nMore text.";
      const result = markdownIt.render(md);
      expect(result).toContain("<h1");
      expect(result).toContain("Heading");
      expect(result).toContain('class="katex"');
      expect(result).toContain("More text");
    });

    it("shall render without errors for complex expressions", () => {
      const result = markdownIt.render(
        "$\\mathcal{L} = -\\frac{1}{4}F_{\\mu\\nu}F^{\\mu\\nu}$"
      );
      expect(result).toContain('class="katex"');
    });
  });
});
