/* DATA Compass · /new/ — behavior for the alternative buyer homepage.
   Everything here is progressive enhancement. Without JavaScript the page
   renders complete: no section starts hidden, the Decision Brief is fully
   readable, and every anchor works. JS adds the mobile menu, the demo modal,
   and one signature motion (the evidence spine resolving on first load).
   The demo form reuses the production destination, field names, validation
   and success behavior unchanged.                                          */
(function () {
  'use strict';

  var root = document.documentElement;
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

  // getClientRects() is the reliable "is this actually on screen" test — unlike
  // offsetParent, it stays correct for position:fixed and sticky elements.
  function onScreen(el) {
    return !!(el && el.isConnected && el.getClientRects().length);
  }

  function visibleFocusable(container) {
    return Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE))
      .filter(function (el) { return onScreen(el) || el === document.activeElement; });
  }

  function trap(container, e) {
    if (e.key !== 'Tab') return;
    var els = visibleFocusable(container);
    if (!els.length) return;
    var first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // Focus must never be handed back to a control that has since been hidden —
  // e.g. a "Request a Demo" button inside the mobile sheet that closed behind
  // the modal. Walk a preference list and return the first control still on
  // screen; <main tabindex="-1"> is the last resort so focus never lands on body.
  var burger = document.getElementById('nbBurger');
  var mobile = document.getElementById('nbMobile');
  var mobileClose = document.getElementById('nbMobileClose');

  function restoreTarget(preferred) {
    var candidates = [
      preferred,
      burger,
      document.querySelector('.nb-nav__cta'),
      document.getElementById('main')
    ];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c || c === document.body || c === root) continue;
      if (mobile.hidden && mobile.contains(c)) continue;   // inside a closed sheet
      if (onScreen(c) && typeof c.focus === 'function') return c;
    }
    return null;
  }

  function restoreFocus(preferred) {
    var t = restoreTarget(preferred);
    if (t) t.focus();
  }

  // Background content is made inert while an overlay is open, so assistive
  // technology and Tab both stop at the overlay. Browsers without inert fall
  // back to the focus trap below, which is unchanged.
  var BACKDROP = ['.nb-skip', '.nb-nav', '#main', '.nb-foot'];
  function setInert(on, extra) {
    BACKDROP.concat(extra || []).forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el) return;
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  }

  /* ---------------------------------------------------------------- mobile menu */
  var menuReturn = null;

  function openMenu() {
    menuReturn = document.activeElement;
    mobile.hidden = false;
    burger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    setInert(true, ['#nbDemoModal']);
    mobileClose.focus();
  }
  function closeMenu(restore) {
    if (mobile.hidden) return;
    mobile.hidden = true;
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    setInert(false, ['#nbDemoModal']);      // lift inert BEFORE focusing back into it
    if (restore !== false) restoreFocus(menuReturn);
  }

  burger.addEventListener('click', openMenu);
  mobileClose.addEventListener('click', function () { closeMenu(); });
  // outside click: anywhere on the sheet that is not a menu control
  mobile.addEventListener('click', function (e) { if (e.target === mobile) closeMenu(); });
  mobile.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { closeMenu(false); });
  });
  mobile.addEventListener('keydown', function (e) { trap(mobile, e); });

  /* ------------------------------------------------------------- demo modal */
  // Web3Forms access key — same destination as the production homepage. Public
  // by design; recipient addresses are stored server-side at web3forms.com.
  var WEB3FORMS_ACCESS_KEY = '16f5a6ca-b05b-40e4-9a29-7a91324f4c92';

  var modal = document.getElementById('nbDemoModal');
  var form = document.getElementById('nbDemoForm');
  var formMsg = document.getElementById('nbFormMsg');
  var formSuccess = document.getElementById('nbFormSuccess');
  var submitBtn = document.getElementById('nbDemoSubmit');
  var modalReturn = null;

  // After a successful send the form is gone, so the first field no longer
  // exists to focus. Always open on whichever panel is actually showing.
  function firstFieldInModal() {
    return form.hidden ? formSuccess : document.getElementById('nb_first');
  }

  function openDemo(origin) {
    // resolve the return target BEFORE the sheet closes and takes it off screen
    modalReturn = restoreTarget(origin || document.activeElement);
    closeMenu(false);
    modal.classList.add('nb-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setInert(true, ['#nbMobile']);
    firstFieldInModal().focus();
  }
  function closeDemo() {
    modal.classList.remove('nb-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setInert(false, ['#nbMobile']);         // lift inert BEFORE focusing back into it
    restoreFocus(modalReturn);
  }

  document.querySelectorAll('[data-nb-demo]').forEach(function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); openDemo(el); });
  });
  document.getElementById('nbDemoClose').addEventListener('click', closeDemo);
  document.getElementById('nbDemoCancel').addEventListener('click', closeDemo);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeDemo(); });
  modal.addEventListener('keydown', function (e) { trap(modal, e); });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('nb-open')) { closeDemo(); return; }
    if (!mobile.hidden) { closeMenu(); }
  });

  function showSuccess() {
    form.hidden = true;
    formSuccess.hidden = false;
    // the submit button just vanished from under the user's focus — move it
    // onto the success panel, which is also a live region so the outcome is
    // announced even if focus is being managed elsewhere.
    formSuccess.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    formMsg.textContent = '';
    formMsg.classList.remove('nb-error');

    var ok = true;
    form.querySelectorAll('[required]').forEach(function (f) {
      if (!f.value.trim()) { f.classList.add('nb-invalid'); f.setAttribute('aria-invalid', 'true'); ok = false; }
      else { f.classList.remove('nb-invalid'); f.removeAttribute('aria-invalid'); }
    });
    var email = form.elements.email;
    if (email.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
      email.classList.add('nb-invalid'); email.setAttribute('aria-invalid', 'true'); ok = false;
    }
    if (!ok) {
      formMsg.textContent = 'Please complete the required fields.';
      formMsg.classList.add('nb-error');
      return;
    }

    if (!WEB3FORMS_ACCESS_KEY || WEB3FORMS_ACCESS_KEY.indexOf('REPLACE') === 0) {
      formMsg.textContent = 'This form is not configured yet.';
      formMsg.classList.add('nb-error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });
    data.access_key = WEB3FORMS_ACCESS_KEY;
    data.subject = 'New demo request — compassfordata.com';
    data.from_name = 'DATA Compass Website';

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (json.success) { showSuccess(); }
      else {
        formMsg.textContent = json.message || 'Something went wrong. Please try again.';
        formMsg.classList.add('nb-error');
        submitBtn.disabled = false; submitBtn.textContent = 'Send';
      }
    }).catch(function () {
      formMsg.textContent = 'Network error — please try again.';
      formMsg.classList.add('nb-error');
      submitBtn.disabled = false; submitBtn.textContent = 'Send';
    });
  });

  /* ------------------------------------------- signature motion: spine resolve */
  // Only now do we claim the pre-state, so a JS failure above can never leave
  // the brief hidden. One pass, on load, never repeated, never scroll-driven.
  var heroBrief = document.getElementById('nbHeroBrief');
  if (heroBrief) {
    root.classList.add('js');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { heroBrief.classList.add('nb-in'); });
    });
  }
}());
