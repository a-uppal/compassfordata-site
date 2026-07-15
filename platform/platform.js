/* DATA Compass · /platform/ — production behavior.
   Composition: production nav/menu/modal/journey (root homepage) +
   Readiness Field interactions (gap reveal, three-reads toggle).
   Everything is progressive enhancement: without JS the page renders
   fully, with the Divergence state static and all stages in order.   */
(function () {
  'use strict';

  // JS is running: enable reveal pre-states (no-JS renderers see everything)
  document.documentElement.classList.add('js');

  // ---- nav scroll state ----
  var nav = document.getElementById('nav');
  addEventListener('scroll', function () {
    nav.classList.toggle('scrolled', scrollY > 40);
  }, { passive: true });

  // ---- mobile menu ----
  var mm = document.getElementById('mobileMenu');
  var hb = document.getElementById('hamburger');
  function closeMenu() { mm.classList.remove('open'); hb.setAttribute('aria-expanded', 'false'); }
  hb.addEventListener('click', function () { mm.classList.add('open'); hb.setAttribute('aria-expanded', 'true'); });
  document.getElementById('mobileClose').addEventListener('click', closeMenu);
  mm.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mm.classList.contains('open')) { closeMenu(); hb.focus(); }
  });

  // ---- single quiet section entrance ----
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.fade-in').forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll('.fade-in').forEach(function (el) { el.classList.add('visible'); });
  }

  // ---- 83 ≠ 50 gap reveal (fires once) ----
  var gap = document.getElementById('gap');
  if (gap && 'IntersectionObserver' in window) {
    var gio = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { gap.classList.add('in'); gio.disconnect(); }
      });
    }, { threshold: 0.35 });
    gio.observe(gap);
  } else if (gap) {
    gap.classList.add('in');
  }

  // ---- explanatory motion: one-time section sequences (observe, play, disconnect) ----
  function playOnce(el, threshold) {
    if (!el) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { el.classList.add('play'); io.disconnect(); }
        });
      }, { threshold: threshold });
      io.observe(el);
    } else {
      el.classList.add('play'); // no observer support: land on the completed state
    }
  }
  playOnce(document.getElementById('ai-success'), 0.3);
  playOnce(document.querySelector('.boundary'), 0.35);

  // security: the external path moves only on explicit approval
  var extBtn = document.getElementById('extToggle');
  var boundary = document.querySelector('.boundary');
  if (extBtn && boundary) {
    extBtn.addEventListener('click', function () {
      var on = !boundary.classList.contains('ext-on');
      boundary.classList.toggle('ext-on', on);
      extBtn.setAttribute('aria-pressed', String(on));
    });
  }

  // ---- how-it-works: sticky evidence journey (native scroll; JS syncs the surface) ----
  (function () {
    var figs = Array.prototype.slice.call(document.querySelectorAll('#jframe figure'));
    var dots = Array.prototype.slice.call(document.querySelectorAll('#jrail button'));
    var scenes = Array.prototype.slice.call(document.querySelectorAll('.scene'));
    var progFill = document.getElementById('jprogFill');
    if (!figs.length || !scenes.length) return;
    function activate(i) {
      figs.forEach(function (f, k) { f.classList.toggle('active', k === i); });
      dots.forEach(function (d, k) { d.classList.toggle('active', k === i); d.setAttribute('aria-pressed', String(k === i)); });
      if (progFill) progFill.style.transform = 'scaleX(' + (i / (figs.length - 1)) + ')';
    }
    if ('IntersectionObserver' in window) {
      var jio = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) activate(Number(e.target.dataset.scene)); });
      }, { rootMargin: '-40% 0px -40% 0px' });
      scenes.forEach(function (s) { jio.observe(s); });
    }
    dots.forEach(function (d, i) {
      d.addEventListener('click', function () {
        scenes[i].scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'center'
        });
      });
    });
  })();

  // ---- three reads: Agreement / Divergence control + the pattern explorer ----
  // The enhanced explorer ships [hidden]; the native-details fallback is the
  // default rendering. Only after every target validates do we swap the two —
  // a stale script or stylesheet can never produce a half-rendered component.
  (function () {
    var readsSec = document.getElementById('defensibility');
    var btnAgree = document.getElementById('btn-agree');
    var btnDiverge = document.getElementById('btn-diverge');
    if (!readsSec || !btnAgree || !btnDiverge) return;

    function syncToggle(isAgree) { // visual/aria state of the two toggle buttons only
      readsSec.classList.toggle('state-agree', isAgree);
      readsSec.classList.toggle('state-diverge', !isAgree);
      btnAgree.setAttribute('aria-pressed', String(isAgree));
      btnDiverge.setAttribute('aria-pressed', String(!isAgree));
    }

    // single source of enhanced-interface content
    var PATTERNS = {
      confirmed:    { num: '01', name: 'Confirmed Maturity', fam: 'Coherent', group: 'align',
        t: 'High', p: 'High', g: 'High',
        mean: 'The data, stakeholder experience, and governance evidence all agree that the domain is strong.',
        move: 'Preserve and propagate. Protect the practices from regression and reuse the controls, artifacts, and working methods that make the domain successful.' },
      aligned:      { num: '02', name: 'Aligned Maturity (suspected)', fam: 'Provisional', group: 'align',
        t: 'High', p: 'High', g: 'Not yet gathered',
        mean: 'Technical evidence and stakeholder experience agree on high maturity, but governance evidence has not yet been reviewed.',
        move: 'Review the governance documents. Determine whether the pattern resolves to Confirmed Maturity or Unformalized Practice.' },
      greenfield:   { num: '03', name: 'Greenfield', fam: 'Neutral', group: 'align',
        t: 'Low', p: 'Low', g: 'Low or deliberately absent',
        mean: 'All available signals agree that the domain is early-stage. This is an investment decision, not necessarily a remediation problem.',
        move: 'Decide whether to invest or accept the current state. Do not treat every Greenfield domain as broken.' },
      usability:    { num: '04', name: 'Usability Gap', fam: 'Divergence', group: 'diverge',
        t: 'High', p: 'Low', g: 'High',
        mean: 'The data and governance evidence appear strong, but the people who depend on the data cannot use it productively.',
        move: 'Examine discoverability, training, UX, and the path from the catalog entry to the practitioner.' },
      tribal:       { num: '05', name: 'Tribal Knowledge', fam: 'Divergence', group: 'diverge',
        t: 'Low', p: 'High', g: 'Deliberately absent',
        mean: 'The domain works because a small number of people know its quirks, while metadata and formal governance remain thin or deliberately absent.',
        move: 'Capture the practice. Externalize the knowledge while the subject-matter experts are still available.' },
      unformalized: { num: '06', name: 'Unformalized Practice', fam: 'Divergence', group: 'diverge',
        t: 'High', p: 'High', g: 'Low',
        mean: 'The data is strong and the team operates effectively, but the working method has not been formally documented.',
        move: 'Codify what already works. Write the SOP around the real operating practice rather than replacing it with a generic template.' },
      abandoned:    { num: '07', name: 'Abandoned Capability', fam: 'Divergence', group: 'diverge',
        t: 'High', p: 'Low', g: 'Deliberately absent',
        mean: 'A technically sound asset remains, but it has lost users, ownership, and governing practice.',
        move: 'Make a decision. Reinvest around a current use case or formally retire the capability.' },
      policy:       { num: '08', name: 'Policy Theater', fam: 'Divergence', group: 'diverge',
        t: 'Low', p: 'Low', g: 'High',
        mean: 'Governance documentation describes a mature system that the data and operating experience do not support.',
        move: 'Audit practice against policy. Reconcile the documented state with operational reality.' }
    };

    var enhanced = document.getElementById('pxEnhanced');
    var fallback = document.getElementById('pxFallback');
    var grid = document.getElementById('pxGrid');
    var tiles = Array.prototype.slice.call(document.querySelectorAll('.px-tile'));
    var panel = document.querySelector('.px-panel');
    var el = {
      num: document.getElementById('pxNum'), name: document.getElementById('pxName'),
      fam: document.getElementById('pxFam'), sigT: document.getElementById('pxSigT'),
      sigP: document.getElementById('pxSigP'), sigG: document.getElementById('pxSigG'),
      mean: document.getElementById('pxMean'), move: document.getElementById('pxMove'),
      status: document.getElementById('pxStatus')
    };

    // validate before swapping interfaces; on any failure the fallback stays
    var dataOk = ['confirmed', 'aligned', 'greenfield', 'usability', 'tribal', 'unformalized', 'abandoned', 'policy']
      .every(function (id) { return PATTERNS[id] && PATTERNS[id].mean && PATTERNS[id].move; });
    var domOk = enhanced && fallback && grid && panel && tiles.length === 8 &&
      Object.keys(el).every(function (k) { return el[k]; }) &&
      tiles.every(function (t) { return PATTERNS[t.dataset.pat]; });
    if (!dataOk || !domOk) {
      btnAgree.addEventListener('click', function () { syncToggle(true); });
      btnDiverge.addEventListener('click', function () { syncToggle(false); });
      return; // enhanced stays hidden; native details remain the catalog
    }

    var committed = null;
    var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

    function renderPattern(id) {
      var d = PATTERNS[id];
      el.num.textContent = d.num; el.name.textContent = d.name; el.fam.textContent = d.fam;
      el.sigT.textContent = d.t; el.sigP.textContent = d.p; el.sigG.textContent = d.g;
      el.mean.textContent = d.mean; el.move.textContent = d.move;
      if (!reduceMotion.matches) { // restrained crossfade; instant under reduced motion
        panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap');
      }
    }
    function previewPattern(id) { renderPattern(id); } // no aria-pressed change, no announcement
    function commitPattern(id, announce) {
      committed = id;
      renderPattern(id);
      tiles.forEach(function (t) { t.setAttribute('aria-pressed', String(t.dataset.pat === id)); });
      syncToggle(PATTERNS[id].group === 'align'); // patterns 1–3 read as Agreement, 4–8 as Divergence
      if (announce !== false) el.status.textContent = 'Selected pattern: ' + PATTERNS[id].name;
    }
    function restoreCommittedPattern() { if (committed) renderPattern(committed); }

    tiles.forEach(function (t) {
      var id = t.dataset.pat;
      t.addEventListener('click', function () { commitPattern(id); }); // click/tap/Enter/Space
      t.addEventListener('pointerenter', function () { previewPattern(id); });
      t.addEventListener('focus', function () { previewPattern(id); });
    });
    grid.addEventListener('pointerleave', restoreCommittedPattern);
    grid.addEventListener('focusout', function (e) {
      if (!grid.contains(e.relatedTarget)) restoreCommittedPattern();
    });

    // toggle commits each state's canonical example
    btnAgree.addEventListener('click', function () { commitPattern('confirmed'); });
    btnDiverge.addEventListener('click', function () { commitPattern('usability'); });

    // initialization succeeded: swap the interfaces, then select the default
    enhanced.hidden = false;
    fallback.hidden = true;
    commitPattern('usability', false); // page loads in Divergence; no announcement on load
  })();

  // ---- Request a Demo modal (production behavior, unchanged) ----
  // Web3Forms access key. Public by design; the destination emails are stored
  // server-side at web3forms.com and never appear on this page.
  var WEB3FORMS_ACCESS_KEY = "16f5a6ca-b05b-40e4-9a29-7a91324f4c92";

  var demoModal = document.getElementById('demoModal');
  var demoForm = document.getElementById('demoForm');
  var formMsg = document.getElementById('formMsg');
  var formSuccess = document.getElementById('formSuccess');
  var submitBtn = document.getElementById('demoSubmit');
  var lastFocus = null;

  function openDemo() {
    lastFocus = document.activeElement;
    demoModal.classList.add('open');
    demoModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { document.getElementById('f_first').focus(); }, 80);
  }
  function closeDemo() {
    demoModal.classList.remove('open');
    demoModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll('[data-demo]').forEach(function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); openDemo(); });
  });
  document.getElementById('demoClose').addEventListener('click', closeDemo);
  document.getElementById('demoCancel').addEventListener('click', closeDemo);
  demoModal.addEventListener('click', function (e) { if (e.target === demoModal) closeDemo(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && demoModal.classList.contains('open')) closeDemo();
  });
  // focus trap while the modal is open
  demoModal.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !demoModal.classList.contains('open')) return;
    var els = Array.prototype.slice.call(demoModal.querySelectorAll('button, input, textarea, summary, [href]'))
      .filter(function (el) { return el.offsetParent !== null; });
    if (!els.length) return;
    var first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  demoForm.addEventListener('submit', function (e) {
    e.preventDefault();
    formMsg.textContent = ''; formMsg.classList.remove('error');

    // client-side validation
    var ok = true;
    demoForm.querySelectorAll('[required]').forEach(function (f) {
      if (!f.value.trim()) { f.classList.add('invalid'); ok = false; }
      else f.classList.remove('invalid');
    });
    var email = demoForm.elements.email;
    if (email.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) { email.classList.add('invalid'); ok = false; }
    if (!ok) { formMsg.textContent = 'Please complete the required fields.'; formMsg.classList.add('error'); return; }

    if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY.indexOf('REPLACE') === 0) {
      formMsg.textContent = 'This form is not configured yet.'; formMsg.classList.add('error'); return;
    }

    submitBtn.disabled = true; submitBtn.textContent = 'Sending…';
    var data = {};
    new FormData(demoForm).forEach(function (v, k) { data[k] = v; });
    data.access_key = WEB3FORMS_ACCESS_KEY;
    data.subject = 'New demo request — compassfordata.com';
    data.from_name = 'DATA Compass Website';

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (json.success) { demoForm.hidden = true; formSuccess.hidden = false; }
      else {
        formMsg.textContent = json.message || 'Something went wrong. Please try again.';
        formMsg.classList.add('error');
        submitBtn.disabled = false; submitBtn.textContent = 'Send';
      }
    }).catch(function () {
      formMsg.textContent = 'Network error — please try again.';
      formMsg.classList.add('error');
      submitBtn.disabled = false; submitBtn.textContent = 'Send';
    });
  });
}());
