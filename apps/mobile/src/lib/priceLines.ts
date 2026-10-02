// Turns the price breakdown sent by the server into readable lines ("Distance  27.3 km × €1.60").
import type { PriceLine } from './api';
import type { Lang, TextKey } from './i18n';

const num = (n: number, lang: Lang, digits = 1) =>
  new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: digits }).format(n);

export function priceLines(
  lines: PriceLine[],
  t: (k: TextKey) => string,
  lang: Lang,
  money: (n: number) => string,
): { label: string; detail?: string; amount: string }[] {
  return lines.map((l) => {
    const label = t(`bd_${l.code}` as TextKey);
    let detail: string | undefined;
    if (l.code === 'distance' && l.quantity != null && l.rate != null) detail = `${num(l.quantity, lang)} km × ${money(l.rate)}`;
    else if (l.code === 'time' && l.quantity != null && l.rate != null) detail = `${num(l.quantity, lang, 0)} min × ${money(l.rate)}`;
    else if ((l.code === 'surcharge' || l.code === 'van') && l.quantity != null) detail = l.code === 'van' ? `${num(l.quantity, lang, 0)} %` : `+${num(l.quantity, lang, 0)} %`;
    else if ((l.code === 'child_seat' || l.code === 'extra_luggage') && l.quantity != null && l.rate != null) detail = `${num(l.quantity, lang, 0)} × ${money(l.rate)}`;
    return { label, detail, amount: money(l.amount) };
  });
}
