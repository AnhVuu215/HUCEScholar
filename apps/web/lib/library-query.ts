import { materialTypes } from './materials';

export interface LibraryQuery {
  search: string;
  courseId: string;
  kind: string;
  materialType: string;
  page: number;
}

/** Only public catalog filters belong in the URL. Bounds mirror LibraryListDto. */
export function parseLibraryQuery(params: Pick<URLSearchParams, 'getAll'>): LibraryQuery {
  const single = (key: string) => {
    const values = params.getAll(key);
    return values.length === 1 ? values[0] : '';
  };
  const search = single('search').trim();
  const course = single('courseId');
  const kind = single('kind');
  const type = single('materialType');
  const page = single('page');
  return {
    search: search.length <= 200 ? search : '',
    courseId:
      /^[1-9]\d{0,18}$/.test(course) && BigInt(course) <= 9223372036854775807n ? course : '',
    kind: ['LECTURER_MATERIAL', 'STUDENT_SUPPLEMENT'].includes(kind) ? kind : '',
    materialType: Object.hasOwn(materialTypes, type) ? type : '',
    page: /^[1-9]\d{0,5}$/.test(page) && Number(page) <= 100000 ? Number(page) : 1,
  };
}

export function libraryQueryString(query: LibraryQuery): string {
  const params = new URLSearchParams();
  for (const key of ['search', 'courseId', 'kind', 'materialType'] as const)
    if (query[key]) params.set(key, query[key]);
  if (query.page > 1) params.set('page', String(query.page));
  return params.toString();
}
