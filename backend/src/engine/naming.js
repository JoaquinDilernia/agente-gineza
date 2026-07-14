const clean = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '');

export function buildAdName({ funnel, adsetTag, creativeName, date = new Date() }) {
  const d = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `${clean(funnel)}_${clean(adsetTag)}_${clean(creativeName)}_${d}`;
}
