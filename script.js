const viewport = document.getElementById("viewport");
const vsections = Array.from(document.querySelectorAll(".vsection"));
const vnav = document.getElementById("vnav");
const vnavLeft = document.getElementById("vnav-left");

// Shared animation core: hand-driven with custom easing curve
const EASE_OUT_QUAD = (t) => t * (2 - t);

function animateScroll(el, prop, targetValue, duration, opts) {
  opts = opts || {};
  const startValue = el[prop];
  const startTime = performance.now();
  el.style.scrollBehavior = "auto"; // don't let CSS scroll-behavior:smooth stack on top of our own animation
  el.style.scrollSnapType = "none"; // don't let scroll-snap fight our frame-by-frame position writes
  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = EASE_OUT_QUAD(t);
    el[prop] = startValue + (targetValue - startValue) * eased;
    if (opts.fadeDip) {
      el.style.opacity = String(1 - Math.sin(t * Math.PI) * opts.fadeDip);
    }
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      el.style.scrollSnapType = "";
      el.style.scrollBehavior = "";
      if (opts.fadeDip) el.style.opacity = "1";
      if (opts.onDone) opts.onDone();
    }
  }
  requestAnimationFrame(frame);
}

const VSCROLL_MS = 950;
const VSCROLL_FADE_DIP = 0.5;
let vNavBusy = false;

function requestVerticalNav(section) {
  if (section === vsections[activeSectionIndex] && !vNavBusy) {
    return; // already there — nothing to move to, nothing to fade
  }
  if (vNavBusy) {
    return; // ignore navigation while animating
  }
  vNavBusy = true;
  updateHeaderTrack(section.id);
  animateScroll(viewport, "scrollTop", section.offsetTop, VSCROLL_MS, {
    fadeDip: VSCROLL_FADE_DIP,
    onDone: () => {
      vNavBusy = false;
    },
  });
}

// Opacity animation with same easing curve
function animateOpacity(el, targetOpacity, duration, onDone) {
  const start = parseFloat(el.style.opacity) || (targetOpacity === 0 ? 1 : 0);
  const startTime = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = EASE_OUT_QUAD(t);
    el.style.opacity = String(start + (targetOpacity - start) * eased);
    if (t < 1) {
      requestAnimationFrame(frame);
    } else if (onDone) {
      onDone();
    }
  }
  requestAnimationFrame(frame);
}

// Text-swap fade: if a new value arrives while a fade is already in flight,
// it's remembered and played once the current one finishes.
function createQueuedFader(el, fadeMs, getShown, applyValue) {
  let pending = null;
  let busy = false;
  function request(value) {
    if (busy) {
      pending = value;
      return;
    }
    if (getShown() === value) return;
    if (!getShown()) {
      applyValue(value); // first-ever reveal: no previous text to fade away from
      return;
    }
    busy = true;
    animateOpacity(el, 0, fadeMs, () => {
      applyValue(value);
      animateOpacity(el, 1, fadeMs, () => {
        busy = false;
        const next = pending;
        pending = null;
        if (next !== null && next !== value) request(next);
      });
    });
  }
  return request;
}

// Build vertical nav dots
vsections.forEach((sec, i) => {
  const dot = document.createElement("div");
  dot.className = "vdot";
  const label = document.createElement("span");
  label.className = "vlabel";
  label.textContent = sec.dataset.label || "";
  dot.appendChild(label);
  dot.addEventListener("click", () => {
    requestVerticalNav(sec);
  });
  vnav.appendChild(dot);
});

const vdots = Array.from(vnav.querySelectorAll(".vdot"));
let activeSectionIndex = 0;

// Header layer: a fixed, independent layer. The title+description
// now fades between topics (swap text while hidden) instead of
// sliding a stacked transform.
const headerLayer = document.getElementById("header-layer");
const headerContentInner = document.getElementById("header-content-inner");
const headerH2 = document.getElementById("header-h2");
const headerP = document.getElementById("header-p");
const topicSpineEl = document.getElementById("topic-spine");
const headerTopicIndex = { "v-dev": 0, "v-tech": 1, "v-music": 2 };
const topicNames = {
  "v-dev": "Kehitys",
  "v-tech": "Muu teknologia",
  "v-music": "Musiikki",
};
const headerCopy = {
  "v-dev": {
    h2: "Kehitys",
    p: "Kokonaisia projekteja, ei kokeiluja. Rakenna itse, ymmärrä, hio.",
  },
  "v-tech": {
    h2: "Muu teknologia",
    p: "Oma infra vuokratun sijaan, ja käyttökelpoisen raudan hyötykäyttöä.",
  },
  "v-music": {
    h2: "Musiikki",
    p: "Kaksi bändiä, kaksi genreä, sävellyksestä julkaisuun ja koko oheistoimintaan itse.",
  },
};

const topicSpineInner = document.getElementById("topic-spine-inner");
const FADE_MS = 280;
let headerShownId = null;
const setHeaderText = createQueuedFader(
  headerContentInner,
  FADE_MS,
  () => headerShownId,
  (sectionId) => {
    const copy = headerCopy[sectionId];
    headerH2.textContent = copy.h2;
    headerP.textContent = copy.p;
    headerShownId = sectionId;
  },
);

let spineShownId = null;
const setTopicSpineText = createQueuedFader(
  topicSpineInner,
  FADE_MS,
  () => spineShownId,
  (sectionId) => {
    topicSpineInner.textContent = topicNames[sectionId];
    spineShownId = sectionId;
  },
);

function updateHeaderTrack(sectionId) {
  const idx = headerTopicIndex[sectionId];
  if (idx === undefined) {
    headerLayer.classList.remove("visible");
    topicSpineEl.classList.remove("visible");
    return;
  }
  headerLayer.classList.add("visible");
  topicSpineEl.classList.add("visible");
  setTopicSpineText(sectionId);
  setHeaderText(sectionId);
}

const idToTopic = {
  "v-dev": "dev",
  "v-tech": "tech",
  "v-music": "music",
};
const lateralNav = document.getElementById("lateral-nav");
const hdotsGlobal = document.getElementById("hdots-global");
let lateralNavTopic = null; // which topic's dots are currently rendered
let lateralDotEls = [];

// Rebuild lateral nav dots when active topic changes
function renderLateralNav(topic) {
  if (!topic) {
    lateralNav.classList.remove("visible");
    lateralNavTopic = null;
    return;
  }
  lateralNav.classList.add("visible");
  if (lateralNavTopic === topic) return;
  lateralNavTopic = topic;
  hdotsGlobal.innerHTML = "";
  lateralDotEls =
    carousels[topic].total > 0
      ? Array.from({ length: carousels[topic].total }, (_, i) => {
          const dot = document.createElement("div");
          dot.className = "hdot";
          dot.addEventListener("click", () => carousels[topic].goToReal(i));
          hdotsGlobal.appendChild(dot);
          return dot;
        })
      : [];
  updateLateralNavState(carousels[topic].getCurrentReal());
}

function updateLateralNavState(realIdx) {
  lateralDotEls.forEach((d, i) => d.classList.toggle("active", i === realIdx));
}

function updateActiveVSection() {
  const mid = viewport.scrollTop + viewport.clientHeight / 2;
  let activeIdx = 0;
  vsections.forEach((sec, i) => {
    if (sec.offsetTop <= mid) activeIdx = i;
  });

  // Only update if section actually changed
  if (activeIdx !== activeSectionIndex) {
    activeSectionIndex = activeIdx;
    vdots.forEach((d, i) => d.classList.toggle("active", i === activeIdx));
  }

  vnavLeft.classList.toggle("on-hero", vsections[activeIdx].id === "v-hero");

  // Update header only during manual scroll (not during explicit nav)
  if (!vNavBusy) {
    const headerLine = viewport.scrollTop + viewport.clientHeight * 0.2;
    let headerIdx = 0;
    vsections.forEach((sec, i) => {
      if (sec.offsetTop <= headerLine) headerIdx = i;
    });
    updateHeaderTrack(vsections[headerIdx].id);
  }

  renderLateralNav(idToTopic[vsections[activeIdx].id] || null);
}

// Debounce resize events to avoid excessive updates when address bar shows/hides
let resizeTimeout;
function handleResize() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(updateActiveVSection, 100);
}

viewport.addEventListener("scroll", updateActiveVSection, { passive: true });
window.addEventListener("resize", handleResize);

const carousels = {};

// Horizontal scrollers: infinite-loop carousel via edge clones
["dev", "tech", "music"].forEach((topic) => {
  const hscroll = document.getElementById("hscroll-" + topic);
  const originals = Array.from(hscroll.querySelectorAll(".hcard-slot"));
  const total = originals.length;

  // Clone last -> prepend, clone first -> append, so real slides sit at index 1..total
  const firstClone = originals[0].cloneNode(true);
  const lastClone = originals[total - 1].cloneNode(true);
  hscroll.insertBefore(lastClone, originals[0]);
  hscroll.appendChild(firstClone);

  // currentIndex is the source of truth for navigation target.
  let currentIndex = 1; // index 0 is the prepended clone
  let currentReal = 0;
  let hScrollAnimating = false;

  function goTo(index, smooth) {
    currentIndex = index;
    hscroll.style.scrollBehavior = smooth ? "smooth" : "auto";
    hscroll.scrollLeft = hscroll.clientWidth * index;
    hscroll.style.scrollBehavior = "";
  }

  // Slower transition for explicit navigation (arrows, keyboard, dots).
  const SLIDE_MS = 950;
  const FADE_DIP = 0.6;
  function goToFade(index) {
    if (hScrollAnimating) return; // ignore clicks during animation
    currentIndex = index;
    hScrollAnimating = true;
    animateScroll(
      hscroll,
      "scrollLeft",
      hscroll.clientWidth * index,
      SLIDE_MS,
      {
        fadeDip: FADE_DIP,
        onDone: () => {
          hScrollAnimating = false;
        },
      },
    );
  }

  function setCount(realIdx) {
    currentReal = realIdx;
    // Only push a visual update to the shared indicator if this
    // topic is the one currently on screen.
    if (lateralNavTopic === topic) updateLateralNavState(realIdx);
  }

  function silentWrap(targetIndex, realIdx) {
    clearTimeout(settleTimer);
    hscroll.style.scrollSnapType = "none";
    goTo(targetIndex, false);
    requestAnimationFrame(() => {
      hscroll.style.scrollSnapType = "";
    });
    setCount(realIdx);
  }

  // Start on the first real slide
  goTo(1, false);

  let settleTimer = null;
  hscroll.addEventListener("scroll", () => {
    const rawIdx = hscroll.scrollLeft / hscroll.clientWidth;
    const nearestIdx = Math.round(rawIdx);

    // Live-update while scrolling
    const liveReal = Math.min(Math.max(nearestIdx - 1, 0), total - 1);
    setCount(liveReal);

    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (hScrollAnimating) return;
      const idx = Math.round(hscroll.scrollLeft / hscroll.clientWidth);
      if (idx === 0) {
        silentWrap(total, total - 1);
      } else if (idx === total + 1) {
        silentWrap(1, 0);
      } else {
        currentIndex = idx;
      }
    }, 120);
  });

  document
    .querySelectorAll('.harrow[data-scroll="' + topic + '"]')
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const dir = parseInt(btn.dataset.dir, 10);
        goToFade(currentIndex + dir);
      });
    });

  carousels[topic] = {
    total,
    step: (dir) => goToFade(currentIndex + dir),
    goToReal: (i) => goToFade(i + 1),
    getCurrentReal: () => currentReal,
  };

  // Re-sync slide widths on resize (orientation change etc.)
  window.addEventListener("resize", () => {
    goTo(currentIndex, false);
  });
});

// Now that carousels are built, run the initial active-section pass
// (deferred until here so renderLateralNav can read carousels[topic].total)
updateActiveVSection();

// Mouse wheel: route through the same controlled animation as
// everything else instead of letting native scroll-snap (much
// faster, inconsistent feel) handle it. One notch = one section,
// with a short cooldown so a single scroll gesture (many wheel
// events) doesn't fire several section jumps.
let wheelCooldown = false;
viewport.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (wheelCooldown || Math.abs(e.deltaY) < 2) return;
    wheelCooldown = true;
    setTimeout(() => {
      wheelCooldown = false;
    }, 900);
    if (e.deltaY > 0) {
      goToNextSection();
    } else {
      goToPrevSection();
    }
  },
  { passive: false },
);

function goToNextSection() {
  const next =
    vsections[Math.min(activeSectionIndex + 1, vsections.length - 1)];
  requestVerticalNav(next);
}

function goToPrevSection() {
  const prev = vsections[Math.max(activeSectionIndex - 1, 0)];
  requestVerticalNav(prev);
}

// Global keyboard navigation: works regardless of what currently has
// focus, since the scrollable viewport isn't focused by default and
// arrow keys would otherwise be swallowed by the document instead.
window.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    goToNextSection();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    goToPrevSection();
  } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    const topic = idToTopic[vsections[activeSectionIndex].id];
    if (!topic) return; // hero/footer sections have no carousel
    e.preventDefault();
    carousels[topic].step(e.key === "ArrowRight" ? 1 : -1);
  }
});
// Left nav buttons for vertical navigation
document.querySelectorAll(".vnav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.classList.contains("vnav-up")) {
      goToPrevSection();
    } else if (btn.classList.contains("vnav-down")) {
      goToNextSection();
    }
  });
});
// Hero's animated down-key button does exactly what ArrowDown,
// scrolling, or swiping down would do: advance to the next section.
document
  .getElementById("hero-down-key")
  .addEventListener("click", goToNextSection);

// Info tooltips: click/tap to toggle (not hover-only, so it works on
// touch devices too), close others when one opens, close on outside click.
function closeAllTooltips() {
  document
    .querySelectorAll(".tooltip-panel.open")
    .forEach((p) => p.classList.remove("open"));
  document
    .querySelectorAll('.info-tip[aria-expanded="true"]')
    .forEach((b) => b.setAttribute("aria-expanded", "false"));
}

document.querySelectorAll(".info-tip").forEach((btn) => {
  const panel = btn.nextElementSibling;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = panel.classList.contains("open");
    closeAllTooltips();
    if (!isOpen) {
      panel.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
    }
  });
});

document.addEventListener("click", closeAllTooltips);
