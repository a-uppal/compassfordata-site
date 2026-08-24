(function () {
  'use strict';

  document.documentElement.classList.add('home-js');

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  var session = document.getElementById('homeSessionDialog');
  var sessionCard = session ? session.querySelector('.home-session__card') : null;
  var form = document.getElementById('homeSessionForm');
  var submitButton = document.getElementById('homeSessionSubmit');
  var formMessage = document.getElementById('homeFormMessage');
  var formSuccess = document.getElementById('homeFormSuccess');
  var returnTarget = null;

  function isVisible(element) {
    return Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  }

  function visibleFocusable(container) {
    return Array.prototype.slice.call(container.querySelectorAll(FOCUSABLE)).filter(function (element) {
      return isVisible(element) && element.getAttribute('aria-hidden') !== 'true';
    });
  }

  function trapFocus(container, event) {
    if (event.key !== 'Tab') return;
    var controls = visibleFocusable(container);
    if (!controls.length) return;
    var first = controls[0];
    var last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setBackgroundInert(isInert) {
    var selectors = [
      '#siteHeader',
      '.home-hero',
      '#how-it-works',
      '#industries',
      '#deployment',
      '.home-close__content',
      '#siteFooter'
    ];
    selectors.forEach(function (selector) {
      var element = document.querySelector(selector);
      if (!element) return;
      if (isInert) element.setAttribute('inert', '');
      else element.removeAttribute('inert');
    });
  }

  function firstSessionField() {
    var firstField = document.getElementById('home_first');
    if (firstField && isVisible(firstField)) return firstField;
    return visibleFocusable(sessionCard)[0] || sessionCard;
  }

  function openSession(origin) {
    if (!session || !sessionCard) return;
    returnTarget = origin || document.querySelector('[data-session-trigger]');
    document.querySelectorAll('.home-disclosure[open]').forEach(function (disclosure) {
      disclosure.removeAttribute('open');
    });
    session.classList.add('is-open');
    session.setAttribute('aria-hidden', 'false');
    document.body.classList.add('session-open');
    setBackgroundInert(true);
    firstSessionField().focus();
  }

  function closeSession() {
    if (!session || !session.classList.contains('is-open')) return;
    session.classList.remove('is-open');
    session.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('session-open');
    setBackgroundInert(false);
    if (returnTarget && isVisible(returnTarget) && typeof returnTarget.focus === 'function') {
      returnTarget.focus();
    } else {
      document.getElementById('main').focus();
    }
  }

  function showFormMessage(message) {
    formMessage.textContent = message;
  }

  function showSuccess() {
    form.hidden = true;
    formSuccess.hidden = false;
    formSuccess.focus();
  }

  async function submitSession(event) {
    event.preventDefault();
    showFormMessage('');

    if (!form.checkValidity()) {
      form.reportValidity();
      var invalidField = form.querySelector(':invalid');
      if (invalidField) invalidField.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Sending…';
    var payload = {};
    new FormData(form).forEach(function (value, key) { payload[key] = value; });

    try {
      var response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
      var result = await response.json().catch(function () { return { success: false }; });
      if (!response.ok || !result.success) {
        showFormMessage('We could not send your request. Please check the details and try again.');
        return;
      }
      showSuccess();
    } catch (_error) {
      showFormMessage('We could not reach the form service. Check your connection and try again.');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Send request';
    }
  }

  document.querySelectorAll('.home-disclosure').forEach(function (disclosure) {
    var summary = disclosure.querySelector('summary');
    disclosure.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && disclosure.open) {
        disclosure.removeAttribute('open');
        summary.focus();
      }
    });
    disclosure.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { disclosure.removeAttribute('open'); });
    });
  });

  document.addEventListener('click', function (event) {
    document.querySelectorAll('.home-disclosure[open]').forEach(function (disclosure) {
      if (!disclosure.contains(event.target)) disclosure.removeAttribute('open');
    });
  });

  if (!session || !sessionCard || !form || !submitButton || !formMessage || !formSuccess) return;

  session.setAttribute('aria-hidden', 'true');
  sessionCard.setAttribute('role', 'dialog');
  sessionCard.setAttribute('aria-modal', 'true');
  document.querySelectorAll('[data-session-dismiss]').forEach(function (button) { button.hidden = false; });

  document.querySelectorAll('[data-session-trigger]').forEach(function (trigger) {
    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      openSession(trigger);
    });
  });

  document.querySelectorAll('[data-session-dismiss]').forEach(function (button) {
    button.addEventListener('click', closeSession);
  });
  session.addEventListener('click', function (event) {
    if (event.target === session) closeSession();
  });
  session.addEventListener('keydown', function (event) { trapFocus(sessionCard, event); });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && session.classList.contains('is-open')) closeSession();
  });
  form.addEventListener('submit', submitSession);
})();
