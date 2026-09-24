import { describe, expect, it } from 'vitest';
import type { Lo } from '@tutors/tutors-model-lib';
import { findResources, highlightParts } from '../../../packages/svelte/ui-navigators/src/search/resource-search';

const lo = (type: string, route: string, title: string, extra = {}): Lo => ({ type, route, title, ...extra } as Lo);
describe('resource discovery', () => {
  it('searches all metadata, groups steps and keeps the matching deep link without exposing hidden branches', () => {
    const course = [
      lo('unit', '/unit/a', 'Main lesson', { los: [
        lo('lab', '/lab/a', 'First lab', { los: [
          lo('step', '/lab/a/one', 'One', { contentMd: 'Arrays are useful.\nArrays again.' }),
          lo('step', '/lab/a/two', 'Two', { contentMd: 'Arrays and objects' })
        ] }),
        lo('notebook', '/notebook/a', 'Python arrays'),
        lo('web', 'https://example.org', 'Array reference'),
        lo('archive', '/files/arrays.zip', 'Arrays download')
      ] }),
      lo('topic', '/topic/hidden', 'Secret arrays', { hide: true, los: [lo('note', '/note/hidden', 'Hidden arrays')] }),
      lo('topic', '/topic/locked', 'Locked arrays', { locked: true, los: [lo('note', '/note/locked', 'Locked arrays')] })
    ];
    const visible = (item: Lo) => !item.hide && !(item as Lo & { locked?: boolean }).locked;
    const results = findResources(course, 'ARRAY', '', visible);
    expect(results.map(r => r.lo.type)).toEqual(['lab', 'notebook', 'web', 'archive']);
    expect(results[0]).toMatchObject({ href: '/lab/a/one', excerpt: 'Arrays are useful.' });
    expect(findResources(course, 'arrays', 'lab', visible)).toHaveLength(1);
    expect(findResources(course, 'missing', '', visible)).toEqual([]);
    expect(findResources(course, '', '', visible)).toHaveLength(4);
    const md = [lo('note', '/note/md', 'Md', { contentMd: '## Options for **grep** and `sed`' })];
    expect(findResources(md, 'grep', '', () => true)[0].excerpt).toBe('Options for grep and sed');
  });

  it('marks every case-insensitive match in an excerpt, keeping the original casing', () => {
    expect(highlightParts('Arrays and arrays.', 'ARRAY')).toEqual([
      { text: 'Array', match: true },
      { text: 's and ', match: false },
      { text: 'array', match: true },
      { text: 's.', match: false }
    ]);
    expect(highlightParts('No hit here', 'x(')).toEqual([{ text: 'No hit here', match: false }]);
    expect(highlightParts('Plain', '  ')).toEqual([{ text: 'Plain', match: false }]);
  });
});
