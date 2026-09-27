// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { copyCode } from '../../../packages/svelte/course/src/markdown/actions/copy-code-action';

it('labels sanitized copy buttons and reports success only after the clipboard write succeeds', async () => {
  const node = document.createElement('article');
  node.innerHTML = '<pre><code>const answer = 42;</code><button class="copy"><span></span></button></pre>';
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const action = copyCode(node);
  const button = node.querySelector('button')!;
  expect(button.getAttribute('aria-label')).toBe('Copy code');
  button.click();
  await Promise.resolve();
  expect(writeText).toHaveBeenCalledWith('const answer = 42;');
  expect(button.getAttribute('aria-label')).toBe('Code copied');
  writeText.mockRejectedValueOnce(new Error('clipboard unavailable'));
  button.click();
  await Promise.resolve();
  expect(button.getAttribute('aria-label')).toMatch(/Copy failed/);
  action.destroy();
});
