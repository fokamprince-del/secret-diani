export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** « Crème au beurre : 5 astuces ! » → « creme-au-beurre-5-astuces ». */
export function slugify(text: string, maxLength = 120): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}
