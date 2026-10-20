import { expect, test } from '@playwright/test';
import { parseLibraryQuery, libraryQueryString } from '../apps/web/lib/library-query';

test('public library filters round-trip with the API bounds', () => {
  const query = parseLibraryQuery(
    new URLSearchParams(
      'search=++Cơ+học++&courseId=9223372036854775807&kind=LECTURER_MATERIAL&materialType=EXAM&page=100000',
    ),
  );
  expect(query).toEqual({
    search: 'Cơ học',
    courseId: '9223372036854775807',
    kind: 'LECTURER_MATERIAL',
    materialType: 'EXAM',
    page: 100000,
  });
  expect(parseLibraryQuery(new URLSearchParams(libraryQueryString(query)))).toEqual(query);
});

test('invalid, repeated and private parameters never enter a library request', () => {
  for (const page of ['0', '-1', '1.5', '1e2', '100001', 'Infinity']) {
    const query = parseLibraryQuery(
      new URLSearchParams(
        `page=${page}&courseId=9223372036854775808&kind=ADMIN&materialType=PDF&note=private&cursor=private`,
      ),
    );
    expect(libraryQueryString(query)).toBe('');
  }
  expect(
    libraryQueryString(
      parseLibraryQuery(new URLSearchParams('search=a&search=b&page=2&page=3&courseId=01')),
    ),
  ).toBe('');
  expect(parseLibraryQuery(new URLSearchParams({ search: 'x'.repeat(201) })).search).toBe('');
});
