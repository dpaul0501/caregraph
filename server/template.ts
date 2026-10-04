/**
 * SMS/WhatsApp fill-in-the-blank format → plain sentence for the extractor.
 *
 *   CG A:31 S:F P:34 C:headache,swelling D:? BP:166/108 HR:_ T:_
 *
 * A age · S sex · P weeks pregnant · C complaints · D danger signs (list, "no", or ? = don't know)
 * BP blood pressure · HR pulse · T temperature. "?" = don't know, "_" = not measured.
 * Fields may be in any order or missing. Unknown fields stay unknown (never "no").
 */
export function parseTemplate(raw: string): string | null {
  if (!/^\s*cg\b/i.test(raw)) return null;
  const f: Record<string, string> = {};
  for (const m of raw.matchAll(/\b([A-Za-z]{1,2})\s*:\s*([^\s]+)/g)) f[m[1].toUpperCase()] = m[2];
  const known = (v?: string) => v !== undefined && v !== '?' && v !== '_' && v !== '';
  const parts: string[] = [];
  if (known(f.A)) parts.push(`${f.A} year old`);
  if (known(f.S)) parts.push(/^f/i.test(f.S) ? 'woman' : /^m/i.test(f.S) ? 'man' : '');
  if (known(f.P)) parts.push(`${f.P} weeks pregnant`);
  if (known(f.C)) parts.push(f.C.split(',').map((c) => c.replace(/_/g, ' ')).join(', '));
  if (known(f.D)) parts.push(/^no(ne)?$/i.test(f.D) ? 'no fits, no bleeding' : f.D.split(',').join(', '));
  if (known(f.BP)) parts.push(`BP ${f.BP}`);
  return parts.filter(Boolean).join(', ') || null;
}
