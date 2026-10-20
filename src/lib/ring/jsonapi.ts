// Minimal, typed JSON:API normalization for Ring Partner API responses.
// Ring returns primary `data` plus an `included` array when `?include=` is used; related
// resources are matched by (type, id). Unrequested relationships only carry `links.related`.

export interface ResourceIdentifier {
  type: string;
  id: string;
}

export interface Relationship {
  data?: ResourceIdentifier | ResourceIdentifier[] | null;
  links?: { related?: string; self?: string };
}

export interface Resource<A = Record<string, unknown>> {
  type: string;
  id: string;
  attributes?: A;
  relationships?: Record<string, Relationship>;
  links?: Record<string, string>;
}

export interface Document<A = Record<string, unknown>> {
  data: Resource<A> | Resource<A>[] | null;
  included?: Resource[];
  links?: { next?: string; self?: string; prev?: string };
  meta?: Record<string, unknown>;
  errors?: JsonApiError[];
}

export interface JsonApiError {
  id?: string;
  status?: string;
  code?: string;
  title?: string;
  detail?: string;
  source?: { pointer?: string };
}

export type IncludedIndex = Map<string, Resource>;

const key = (type: string, id: string) => `${type}\u0000${id}`;

export function indexIncluded(doc: Pick<Document, "included">): IncludedIndex {
  const idx: IncludedIndex = new Map();
  for (const r of doc.included ?? []) idx.set(key(r.type, r.id), r);
  return idx;
}

/** Resolve a to-one relationship against the included index. */
export function resolveOne<A = Record<string, unknown>>(
  resource: Resource,
  relName: string,
  idx: IncludedIndex,
): Resource<A> | null {
  const rel = resource.relationships?.[relName];
  const data = rel?.data;
  if (!data || Array.isArray(data)) return null;
  return (idx.get(key(data.type, data.id)) as Resource<A> | undefined) ?? null;
}

/** Resolve a to-many relationship (missing members are skipped). */
export function resolveMany<A = Record<string, unknown>>(
  resource: Resource,
  relName: string,
  idx: IncludedIndex,
): Resource<A>[] {
  const data = resource.relationships?.[relName]?.data;
  if (!data) return [];
  const list = Array.isArray(data) ? data : [data];
  return list.flatMap((d) => {
    const r = idx.get(key(d.type, d.id));
    return r ? [r as Resource<A>] : [];
  });
}

export function asArray<A>(data: Resource<A> | Resource<A>[] | null | undefined): Resource<A>[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/** Pull the `page[key]` cursor out of a `links.next` URL or path. */
export function nextPageKey(doc: Pick<Document, "links">): string | null {
  const next = doc.links?.next;
  if (!next) return null;
  try {
    const url = new URL(next, "https://api.amazonvision.com");
    return url.searchParams.get("page[key]");
  } catch {
    return null;
  }
}
