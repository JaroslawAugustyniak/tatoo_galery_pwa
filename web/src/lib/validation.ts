export const RESERVED_SLUGS = new Set(["www", "admin", "api", "t", "app", "static", "_next", "mail"]);
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export const isValidSlug = (slug: string) => SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug);
export const MIN_PASSWORD = 8;
