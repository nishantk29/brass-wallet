// The menu pill: sits at the bottom of a game screen, above the Next button, and opens the menu sheet. The sheet grows
// out of the pill (FLIP: scale + fade from the pill's box to its own) and shrinks back into it on close. Reduced motion
// or Animations off: no movement at all, the sheet just appears. Focus moves into the sheet and back to the pill.
const MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export const morePillHtml = ({ label, act, open = false }) =>
  `<button class="more-pill" data-act="${attr(act)}" aria-haspopup="dialog" aria-expanded="${open ? 'true' : 'false'}">${MENU}<span>${attr(label)}</span></button>`;

const still = () => document.documentElement.classList.contains('flat') || matchMedia('(prefers-reduced-motion: reduce)').matches;
// The transform that lays box `to` over box `from`, scaled about the centre.
const over = (from, to) => `translate(${from.left + from.width / 2 - (to.left + to.width / 2)}px,${from.top + from.height / 2 - (to.top + to.height / 2)}px) scale(${from.width / to.width},${from.height / to.height})`;
const EASE = 'cubic-bezier(.2,.8,.2,1)';

function focusInto(sheet) {
  const first = sheet.querySelector('button:not([disabled]), input, [href], [tabindex]:not([tabindex="-1"])');
  (first || sheet).focus({ preventScroll: true });
}

// Opens: call right after the sheet is in the page.
export function morphFrom(pillEl, sheetEl) {
  if (!sheetEl) return null;
  focusInto(sheetEl);
  if (!pillEl || still() || !sheetEl.animate) return null;
  const p = pillEl.getBoundingClientRect(), s = sheetEl.getBoundingClientRect();
  if (!p.width || !s.width) return null;
  sheetEl.classList.add('is-settled'); // this replaces the sheet's own rise entrance
  const kf = [{ transform: over(p, s), opacity: 0 }, { opacity: 1, offset: 0.45 }, { transform: 'none', opacity: 1 }];
  return sheetEl.animate(kf, { duration: 260, easing: EASE });
}

// Closes: `sheetEl` (and its backdrop) were taken out of the page by the repaint that closed them. They shrink back into
// the pill in a layer that ignores taps and screen readers, then go. Focus returns to the pill.
export function morphBack(pillEl, sheetEl, scrimEl) {
  if (!pillEl) return null;
  pillEl.focus({ preventScroll: true });
  document.querySelector('.more-ghost')?.remove();
  if (!sheetEl || still() || !sheetEl.animate) return null;
  const ghost = document.createElement('div');
  ghost.className = 'more-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  for (const el of [scrimEl, sheetEl]) if (el) { el.classList.add('is-settled'); el.removeAttribute('aria-modal'); el.removeAttribute('role'); ghost.append(el); }
  document.body.append(ghost);
  const p = pillEl.getBoundingClientRect(), s = sheetEl.getBoundingClientRect();
  const kf = [{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.4 }, { transform: over(p, s), opacity: 0 }];
  const a = sheetEl.animate(kf, { duration: 220, easing: EASE });
  scrimEl?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out' });
  pillEl.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
  const done = () => ghost.remove();
  a.finished.then(done, done);
  return a;
}
