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

  // ---- three reads: Agreement / Divergence two-state control ----
  var readsSec = document.getElementById('defensibility');
  var btnAgree = document.getElementById('btn-agree');
  var btnDiverge = document.getElementById('btn-diverge');
  function setReads(isAgree) {
    readsSec.classList.toggle('state-agree', isAgree);
    readsSec.classList.toggle('state-diverge', !isAgree);
    btnAgree.setAttribute('aria-pressed', String(isAgree));
    btnDiverge.setAttribute('aria-pressed', String(!isAgree));
  }
  if (readsSec && btnAgree && btnDiverge) {
    btnAgree.addEventListener('click', function () { setReads(true); });
    btnDiverge.addEventListener('click', function () { setReads(false); });
  }

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
