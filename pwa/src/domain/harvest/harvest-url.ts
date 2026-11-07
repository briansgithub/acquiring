/** Frozen 801cf798 HarvestService slug: trim, strip trailing `/`, substringAfter theorytab/view/, `/` → `__`. No network. */
export function harvestSlugFromUrl(url: string): string {
  const cleaned = url.trim().replace(/\/+$/, '');
  const marker = 'theorytab/view/';
  const index = cleaned.indexOf(marker);
  const rest = index === -1 ? cleaned : cleaned.slice(index + marker.length);
  return rest.replaceAll('/', '__');
}
