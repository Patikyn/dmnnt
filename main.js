/* Smooth scroll. The wheel no longer moves the page directly — it moves a
   target, and the page eases towards it. The page is mostly one big sticky
   screen with a second sliding over it, and that reads far better glided than
   stepped.

   Deliberately driven by scrollTo rather than by transforming a wrapper: every
   effect on this page hangs off the native scroll event and reads real
   getBoundingClientRect values, and scrollTo keeps all of that true. A
   transformed wrapper would have desynced the lot.

   Left alone on touch (the OS already glides, and hijacking it fights the
   rubber-band) and under reduced motion. */
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const EASE = 0.11;   // share of the remaining distance eaten per 60fps frame
  const SNAP = 0.4;    // px — closer than this and the glide is done

  let target = scrollY;
  let running = false;
  let last = 0;

  const limit = () => document.documentElement.scrollHeight - innerHeight;

  // One wheel notch in px. Firefox reports lines or pages instead of pixels.
  const pixels = (e) =>
    e.deltaMode === 1 ? e.deltaY * 16 :
    e.deltaMode === 2 ? e.deltaY * innerHeight :
    e.deltaY;

  const frame = (now) => {
    const diff = target - scrollY;
    if (Math.abs(diff) < SNAP) { running = false; return; }

    // Normalised to the frame time so the glide lasts as long on a 120Hz
    // display as it does on a 60Hz one.
    const dt = Math.min(now - last, 50) || 16.7;
    last = now;
    scrollTo(0, scrollY + diff * (1 - Math.pow(1 - EASE, dt / 16.7)));
    requestAnimationFrame(frame);
  };

  addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;            // pinch-zoom belongs to the browser
    // requestAnimationFrame is suspended in a background document, so the glide
    // could not run — hand the wheel back rather than swallow it.
    if (document.hidden) return;
    e.preventDefault();

    if (!running) target = scrollY;
    target = Math.max(0, Math.min(limit(), target + pixels(e)));

    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }, { passive: false });

  // Anything that moves the page while the glide is idle — keys, the scrollbar,
  // the switcher's jump back to the top — becomes the new starting point.
  addEventListener('scroll', () => { if (!running) target = scrollY; }, { passive: true });
})();

/* The first screen opens with its headline rising through the line masks,
   without waiting to be scrolled into view — it is already in view. */
(() => {
  document.querySelectorAll('.hero, .hero-media')
    .forEach((el) => el.classList.add('is-in'));
})();

/* Every section below the first screen reveals itself as it comes into view,
   and re-arms on the way out so it plays again on the way back. What each one
   does with `is-in` is entirely in the CSS: the bracket wipes its lines open
   and pops its pills, the cards rise, the footer draws its grid.
   Driven by the scroll event rather than an IntersectionObserver so it runs
   on the same tick as the rest of the page's scroll work.
   The threshold is a share of the section's own height, so a 571px band and a
   917px one both open at the same point in their travel rather than the taller
   one waiting for an absolute number of pixels it reaches much later. */
(() => {
  const sections = [...document.querySelectorAll(
    '.bracket, .wwd, .news, .talk, .site-footer'
  )];
  if (!sections.length) return;

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    sections.forEach((s) => s.classList.add('is-in', 'is-text', 'is-late'));
    return;
  }

  /* A section can also ask for later cues of its own — a share of whichever
     is smaller, its own height or the screen:
       data-text-in   → `is-text`  (the bracket's heading)
       data-reveal-in → `is-late`  (the bracket's pills)
     Each is kept until the section has left the screen entirely, so a staged
     entrance is seen whole and never cut off half-played as it scrolls out.
     Everything else in the section still opens on the ordinary `is-in`. */
  const CUES = [['textIn', 'is-text'], ['revealIn', 'is-late']];

  const tick = () => {
    sections.forEach((section) => {
      const r = section.getBoundingClientRect();
      const shown = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
      section.classList.toggle('is-in', shown > r.height * 0.15);
      CUES.forEach(([key, cls]) => {
        const enter = parseFloat(section.dataset[key]);
        if (!enter) return;
        const on = section.classList.contains(cls);
        if (!on && shown > Math.min(r.height, innerHeight) * enter) section.classList.add(cls);
        else if (on && shown <= 0) section.classList.remove(cls);
      });
    });
  };

  tick();
  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', tick);
})();

/* The hero crosshair follows the pointer and eases back to its Figma
   resting position (1004 / 352 of the 1920 frame) when the pointer leaves. */
(() => {
  const hero = document.querySelector('.hero');
  const rules = hero && hero.querySelector('.hero__rules');
  if (!rules) return;

  let box = hero.getBoundingClientRect();
  let tracking = false;

  const move = (x, y) => {
    rules.style.setProperty('--cx', x.toFixed(2) + 'px');
    rules.style.setProperty('--cy', y.toFixed(2) + 'px');
  };

  /* The resting position is read back out of the CSS (--rest-x as a share of
     the hero width, --rest-y in rem) rather than held here, so each breakpoint
     can put the cross where its own frame draws it. */
  const rest = () => {
    tracking = false;
    const css = getComputedStyle(rules);
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    move(box.width * parseFloat(css.getPropertyValue('--rest-x')),
         parseFloat(css.getPropertyValue('--rest-y')) * rem);
  };

  rest();
  rules.classList.add('is-live');

  hero.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    tracking = true;
    move(e.clientX - box.left, e.clientY - box.top);
  });

  hero.addEventListener('pointerleave', rest);

  addEventListener('resize', () => {
    box = hero.getBoundingClientRect();
    if (!tracking) rest();
  });

  addEventListener('scroll', () => {
    box = hero.getBoundingClientRect();
  }, { passive: true });
})();

/* The footer grid drifts after the pointer, the same device as the hero's
   rule. Both the input and the output are measured against the centre cell —
   the square the four lines cut out — not against the footer. So the pointer
   only reads as movement while it is in or near that square, and by the time
   it reaches the far edges of the page the grid has already settled at its
   limit instead of still being dragged around.

   Each line is capped at 7% of its own laid-out coordinate, which is what
   keeps the whole grid near where it was drawn: ±48 on the 695 rule, ±79 on
   the 1124, ±10 on the 139, ±28 on the 395. Because the cap is a share of
   each line's own position rather than one shared number, the two members of
   a pair never travel the same distance — so the cell breathes wider than any
   single line wanders, which is the part that should read.

   Each line also chases at its own speed, so left and right feel independent;
   the crosses are glued in the CSS to the two lines that meet under them, so
   the four corners always agree and the centre stays a square. Runs on
   `translate`, so it plays over the draw-in, not instead of it. */
(() => {
  const footer = document.querySelector('.site-footer');
  if (!footer) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  const v1 = footer.querySelector('.frule--v1');
  const v2 = footer.querySelector('.frule--v2');
  const h1 = footer.querySelector('.frule--h1');
  const h2 = footer.querySelector('.frule--h2');
  if (!v1 || !v2 || !h1 || !h2) return;

  const DRIFT = 0.07;   // ±7% of each line's own coordinate
  const LINES = [
    { v: '--v1o', el: v1, axis: 'x', ease: 0.048, cur: 0 },
    { v: '--v2o', el: v2, axis: 'x', ease: 0.090, cur: 0 },
    { v: '--h1o', el: h1, axis: 'y', ease: 0.064, cur: 0 },
    { v: '--h2o', el: h2, axis: 'y', ease: 0.036, cur: 0 },
  ];

  /* offsetLeft/offsetTop, not getBoundingClientRect: the rules are the very
     things being translated, and their laid-out positions are what the cell
     is defined by. */
  const cell = () => {
    const r = footer.getBoundingClientRect();
    return {
      cx: r.left + (v1.offsetLeft + v2.offsetLeft) / 2,
      cy: r.top + (h1.offsetTop + h2.offsetTop) / 2,
      hw: (v2.offsetLeft - v1.offsetLeft) / 2,
      hh: (h2.offsetTop - h1.offsetTop) / 2,
    };
  };

  let nx = 0, ny = 0;   // pointer, −1…1 from the centre cell's own edges
  let raf = 0;
  let last = 0;

  const frame = (now) => {
    const dt = Math.min(now - last, 50) || 16.7;
    last = now;

    let alive = false;
    for (const line of LINES) {
      const base = line.axis === 'x' ? line.el.offsetLeft : line.el.offsetTop;
      const target = (line.axis === 'x' ? nx : ny) * base * DRIFT;
      line.cur += (target - line.cur) * (1 - Math.pow(1 - line.ease, dt / 16.7));
      if (Math.abs(target - line.cur) > 0.05) alive = true;
      footer.style.setProperty(line.v, line.cur.toFixed(2) + 'px');
    }

    raf = alive ? requestAnimationFrame(frame) : 0;
  };

  const wake = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  footer.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const c = cell();
    nx = Math.max(-1, Math.min(1, (e.clientX - c.cx) / c.hw));
    ny = Math.max(-1, Math.min(1, (e.clientY - c.cy) / c.hh));
    wake();
  });

  footer.addEventListener('pointerleave', () => { nx = 0; ny = 0; wake(); });
})();

/* The mobile menu. The button and the panel are inert above the breakpoint —
   the CSS hides the one and dissolves the other into `display: contents` — so
   this runs at every width without needing to know which one it is at. */
(() => {
  const header = document.querySelector('.header');
  const burger = header && header.querySelector('.burger');
  const menu = header && header.querySelector('.hmenu');
  if (!burger || !menu) return;

  const set = (open) => {
    header.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  };

  burger.addEventListener('click', () => {
    set(!header.classList.contains('is-open'));
  });

  // Both links inside jump within this page, so the panel has to get out of
  // the way itself — there is no navigation to close it.
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) set(false);
  });

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('is-open')) {
      set(false);
      burger.focus();
    }
  });
})();

/* The footer slot is one frame of five — car, racket, ball, glove, bike —
   turned over once a second. It opens on the ball, the frame the file draws. The leaving frame is cut, the arriving one plays
   itself in (.fswap__img.is-on), so each swap has a beat instead of a blink. */
(() => {
  const frames = [...document.querySelectorAll('.fswap__img')];
  if (frames.length < 2) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let i = Math.max(0, frames.findIndex((f) => f.classList.contains('is-on')));

  setInterval(() => {
    if (document.hidden) return;
    frames[i].classList.remove('is-on');
    i = (i + 1) % frames.length;
    frames[i].classList.add('is-on');
  }, 1000);
})();
