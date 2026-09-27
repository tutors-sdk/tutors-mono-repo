import { describe, expect, it } from 'vitest';
import type { Lo } from '@tutors/tutors-model-lib';
import { findResources, highlightParts, searchTerms, withHighlight } from '../../../packages/svelte/ui-navigators/src/search/resource-search';

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
    // Title matches rank first, in course order; the lab only matches in a step's text.
    expect(results.map(r => r.lo.type)).toEqual(['notebook', 'web', 'archive', 'lab']);
    expect(results[3]).toMatchObject({ href: '/lab/a/one', excerpt: 'Arrays are useful.' });
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

  it('matches every word anywhere, ranks title over summary over text, and prefers the whole phrase', () => {
    const course = [
      lo('note', '/note/text', 'Setup', { contentMd: 'Install node first.\nLater, configure the database.' }),
      lo('note', '/note/summary', 'Getting going', { summary: '<p>Node and database setup</p>', contentMd: '' }),
      lo('note', '/note/title', 'Node database basics', { contentMd: '' }),
      lo('note', '/note/one', 'Node only', { contentMd: 'no second word here' })
    ];
    const results = findResources(course, 'database node', '', () => true);
    expect(results.map(r => r.href)).toEqual(['/note/title', '/note/summary', '/note/text']);
    expect(results[2].excerpt).toBe('Install node first.');
    expect(findResources(course, 'node database xyzzy', '', () => true)).toEqual([]);
    const phrase = [lo('note', '/note/apart', 'A', { contentMd: 'node here\nand database there' }), lo('note', '/note/together', 'B', { contentMd: 'the node database line' })];
    expect(findResources(phrase, 'node database', '', () => true).map(r => r.href)).toEqual(['/note/together', '/note/apart']);
    expect(findResources(phrase, 'node database', '', () => true)[0].excerpt).toBe('the node database line');
  });

  it('marks each word, splits a query into distinct lower-case words, and carries it on local links only', () => {
    expect(highlightParts('Node and Database', 'database node').filter(p => p.match).map(p => p.text)).toEqual(['Node', 'Database']);
    expect(searchTerms('  Node  node DATABASE ')).toEqual(['node', 'database']);
    expect(withHighlight('/note/a', 'gantt charts')).toBe('/note/a?highlight=gantt%20charts');
    expect(withHighlight('/lab/a/01?x=1', 'x')).toBe('/lab/a/01?x=1&highlight=x');
    expect(withHighlight('https://example.org', 'x')).toBe('https://example.org');
    expect(withHighlight('/note/a', '  ')).toBe('/note/a');
  });
});
