// @vitest-environment happy-dom
import { it, expect, vi } from 'vitest';
import { themeService } from '../../../packages/svelte/themes/src/services/themes.svelte.ts';
import { FluentIconLib } from '../../../packages/svelte/themes/src/icons/fluent-icons.ts';
import { EasterIcons } from '../../../packages/svelte/themes/src/icons/easter-icons.ts';

vi.mock('../../../packages/svelte/runes/src/index.svelte.ts', () => import('../../bdd/support/runes-stub.ts'));

it('keeps themed icons and falls back to the matching standard icon for missing entries', () => {
  themeService.setTheme('easter');
  expect(themeService.getIcon('course')).toEqual(EasterIcons.course);
  expect(themeService.getIcon('coursetree')).toEqual(FluentIconLib.coursetree);
  expect(themeService.getTypeColour('coursetree')).toBe(FluentIconLib.coursetree.color);
  themeService.setTheme('tutors');
});
