// ================================================================
// DigiID Verify — Government of India Portal
// script.js — Connected to /api/documents backend
// ================================================================
(function () {
    'use strict';

    // ── Session guard ─────────────────────────────────────────────
    if (!sessionStorage.getItem('digiid_auth')) {
        window.location.replace('/login.html');
        return;
    }
    if (localStorage.getItem('digiid-theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    // ── i18n: Apply language on load ─────────────────────────────
    var currentLang = localStorage.getItem('digiid-lang') || 'en';
    if (typeof applyTranslations === 'function') applyTranslations(currentLang);

    // ── Wire langBtn toggle ──────────────────────────────────────
    var langBtnEl = document.getElementById('langBtn');
    if (langBtnEl) {
        // Set initial label
        var langSpan = langBtnEl.querySelector('[data-i18n="language"]');
        if (langSpan) langSpan.textContent = currentLang === 'hi' ? 'English' : 'हिंदी';

        langBtnEl.addEventListener('click', function () {
            currentLang = currentLang === 'en' ? 'hi' : 'en';
            localStorage.setItem('digiid-lang', currentLang);
            window.currentLang = currentLang;
            if (typeof applyTranslations === 'function') applyTranslations(currentLang);
            // Update button label: show opposite language
            if (langSpan) langSpan.textContent = currentLang === 'hi' ? 'English' : 'हिंदी';
        });
    }

    // ── State ─────────────────────────────────────────────────────
    const MAX_DOCS = 3;
    const submittedDocs = new Set();

    const DOC_META = {
        aadhaar: { label: 'Aadhaar Card', issuer: 'UIDAI — Govt. of India', iconClass: 'di-blue', icon: 'card' },
        pan: { label: 'PAN Card', issuer: 'Income Tax Dept, GOI', iconClass: 'di-orange', icon: 'card' },
        voter: { label: 'Voter Identity', issuer: 'Election Commission (ECI)', iconClass: 'di-green', icon: 'person' },
    };

    const DOC_FIELDS = {
        aadhaar: { fieldLabel: 'aadhaar_number', placeholder: 'placeholder_aadhaar', maxlength: 14, authority: 'UIDAI — Govt. of India' },
        pan: { fieldLabel: 'pan_number', placeholder: 'placeholder_pan', maxlength: 10, authority: 'Income Tax Dept, GOI' },
        voter: { fieldLabel: 'epic_number', placeholder: 'placeholder_epic', maxlength: 12, authority: 'Election Commission (ECI)' },
    };

    // ── DOM refs ──────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    const statTotal = $('statTotal');
    const statSecured = $('statSecured');
    const statSync = $('statSync');
    const statSyncSub = $('statSyncSub');
    const statStatus = $('statStatus');
    const statStatusSub = $('statStatusSub');
    const vaultCount = $('vaultCount');
    const vaultEmpty = $('vaultEmpty');
    const docCardsList = $('docCardsList');
    const vaultSecured = $('vaultSecured');
    const formError = $('formError');
    const submitBtn = $('submitBtn');
    const studentForm = $('studentForm');
    const successModal = $('successModal');
    const verifyCard = $('verifyCard');

    // ── Topbar controls ───────────────────────────────────────────
    $('btnFontInc')?.addEventListener('click', () => {
        const s = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        document.documentElement.style.fontSize = Math.min(s + 1, 21) + 'px';
    });
    $('btnFontDec')?.addEventListener('click', () => {
        const s = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        document.documentElement.style.fontSize = Math.max(s - 1, 13) + 'px';
    });
    $('btnAudit')?.addEventListener('click', () => {
        alert(t('audit_alert'));
    });
    $('btnSmartExtract')?.addEventListener('click', () => {
        alert(t('smart_extract_alert'));
    });

    // ── Mobile nav ────────────────────────────────────────────────
    const mobileToggle = $('mobileToggle');
    const headerNav = $('headerNav');
    if (mobileToggle && headerNav) {
        mobileToggle.addEventListener('click', () => headerNav.classList.toggle('open'));
        document.addEventListener('click', e => {
            if (!e.target.closest('.site-header')) headerNav.classList.remove('open');
        });
    }

    // ── Doc type tabs ─────────────────────────────────────────────
    const docTabs = document.querySelectorAll('.doc-tab');
    const enrollmentLabel = $('enrollmentLabel');
    const enrollmentInput = $('enrollment');
    const authorityInput = $('institute'); // hidden field

    function applyDocFields(docType) {
        const cfg = DOC_FIELDS[docType] || DOC_FIELDS.aadhaar;
        var labelSpan = enrollmentLabel ? enrollmentLabel.querySelector('[data-i18n]') : null;
        if (labelSpan) {
            labelSpan.setAttribute('data-i18n', cfg.fieldLabel);
            labelSpan.textContent = t(cfg.fieldLabel);
        } else if (enrollmentLabel) {
            enrollmentLabel.childNodes[0].textContent = t(cfg.fieldLabel) + ' ';
        }
        if (enrollmentInput) {
            enrollmentInput.setAttribute('data-i18n-placeholder', cfg.placeholder);
            enrollmentInput.placeholder = t(cfg.placeholder);
            enrollmentInput.maxLength = cfg.maxlength;
            enrollmentInput.value = '';
        }
        if (authorityInput) authorityInput.value = cfg.authority;
    }

    docTabs.forEach(tab => {
        tab.addEventListener('click', function () {
            docTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            applyDocFields(this.dataset.doc);
        });
    });
    applyDocFields('aadhaar');

    function getActiveDocType() {
        const a = document.querySelector('.doc-tab.active');
        return a ? a.dataset.doc : 'aadhaar';
    }

    // ── Stats & vault helpers ─────────────────────────────────────
    function updateStats(count, lastDate) {
        animateCount(statTotal, count);
        animateCount(statSecured, count);
        if (statSync) {
            statSync.textContent = lastDate ? relativeTime(lastDate) : t('never');
            statSync.style.fontSize = '0.95rem';
        }
        if (statSyncSub) statSyncSub.textContent = count > 0 ? t('auto_sync_enabled') : t('no_documents_yet');
        if (count >= 1) {
            if (statStatus) { statStatus.textContent = t('verified'); statStatus.classList.add('saff'); }
            if (statStatusSub) statStatusSub.textContent = t('identity_confirmed');
        } else {
            if (statStatus) { statStatus.textContent = t('pending'); statStatus.classList.remove('saff'); }
            if (statStatusSub) statStatusSub.textContent = t('submit_to_activate');
        }
        if (vaultCount) vaultCount.textContent = `${count} ${count !== 1 ? t('documents_count') : t('document_count_singular')}`;
    }

    function animateCount(el, target) {
        if (!el) return;
        let cur = parseInt(el.textContent) || 0;
        if (cur === target) return;
        const step = target > cur ? 1 : -1;
        const iv = setInterval(() => {
            cur += step; el.textContent = cur;
            if (cur === target) clearInterval(iv);
        }, 60);
    }

    function relativeTime(isoStr) {
        const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
        if (diff < 60) return t('just_now');
        if (diff < 3600) return Math.floor(diff / 60) + ' ' + t('min_ago');
        if (diff < 86400) return Math.floor(diff / 3600) + ' ' + t('hr_ago');
        return new Date(isoStr).toLocaleDateString(currentLang === 'hi' ? 'hi-IN' : 'en-IN');
    }

    function cardIconSvg(icon) {
        return icon === 'person'
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`;
    }

    function addVaultCard(docType, hash, name, authority, animate = true) {
        const meta = DOC_META[docType] || DOC_META.aadhaar;
        if (vaultEmpty) vaultEmpty.style.display = 'none';
        if (docCardsList) docCardsList.style.display = 'flex';
        if (verifyCard) verifyCard.classList.add('visible');

        const card = document.createElement('div');
        card.className = 'doc-card' + (animate ? '' : '');
        card.dataset.docType = docType;
        card.innerHTML = `
      <div class="doc-card-top">
        <div class="doc-card-left">
          <div class="doc-icon ${meta.iconClass}">${cardIconSvg(meta.icon)}</div>
          <div>
            <div class="doc-name">${meta.label}</div>
            <div class="doc-issuer">${authority || meta.issuer}</div>
          </div>
        </div>
        <span class="badge-ver">${t('badge_verified')}</span>
      </div>
      <div class="doc-hash">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;flex-shrink:0">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <div>
          <span class="hash-lbl">${t('blockchain_fingerprint')}</span>
          <div class="hash-val">${hash}</div>
        </div>
      </div>`;

        if (docCardsList) docCardsList.appendChild(card);
        submittedDocs.add(docType);
        if (submittedDocs.size >= MAX_DOCS && vaultSecured) vaultSecured.style.display = 'flex';
    }

    // ── Load existing documents on page load ──────────────────────
    async function loadDocuments() {
        try {
            const res = await fetch('/api/documents');
            const data = await res.json();
            if (!data.success) return;

            const docs = data.data;
            if (docs.length === 0) return;

            const lastDate = docs[0]?.anchored_at;
            docs.forEach(doc => addVaultCard(doc.doc_type, doc.hash, doc.name, doc.authority, false));
            updateStats(docs.length, lastDate);
        } catch { /* server may be starting */ }
    }
    loadDocuments();

    // ── Anchor Form Submit → POST /api/documents ──────────────────
    if (studentForm) {
        studentForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            hideError();

            if (!$('declaration')?.checked) {
                showError(t('accept_declaration_error'));
                return;
            }

            const docType = getActiveDocType();
            if (submittedDocs.has(docType)) {
                showError(`${DOC_META[docType].label} ${t('already_anchored_session')}`);
                return;
            }

            const payload = {
                doc_type: docType,
                name: $('name')?.value.trim(),
                identity_no: $('enrollment')?.value.trim(),
                dob: $('dob')?.value,
                authority: $('institute')?.value || DOC_FIELDS[docType].authority,
                address: $('address')?.value.trim() || '',
            };

            if (!payload.name || !payload.identity_no || !payload.dob) {
                showError(t('fill_required_fields'));
                return;
            }

            setSubmitting(true);

            try {
                const res = await fetch('/api/documents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();

                if (res.status === 201) {
                    const doc = data.data;
                    addVaultCard(doc.doc_type, doc.hash, doc.name, doc.authority, true);
                    updateStats(submittedDocs.size, doc.anchored_at);

                    $('modalMsg').textContent = data.message;
                    $('modalHash').textContent = doc.hash;
                    showModal();
                    studentForm.reset();
                    $('declaration').checked = false;
                    docTabs.forEach(t => t.classList.remove('active'));
                    docTabs[0]?.classList.add('active');
                    applyDocFields('aadhaar');

                } else if (res.status === 409) {
                    showError(t('identity_already_anchored'));
                } else if (res.status === 400) {
                    showError(data.errors ? data.errors.join(' • ') : t('validation_failed'));
                } else {
                    showError(data.error || t('general_error'));
                }
            } catch {
                showError(t('cannot_reach_server'));
            } finally {
                setSubmitting(false);
            }
        });
    }

    function setSubmitting(loading) {
        if (!submitBtn) return;
        submitBtn.disabled = loading;
        submitBtn.innerHTML = loading
            ? `<svg style="width:17px;height:17px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${t('anchoring_to_ledger')}`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> ${t('secure_details_ledger')}`;
    }
    function showError(msg) {
        if (formError) { formError.textContent = '⚠ ' + msg; formError.style.display = 'block'; formError.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }
    function hideError() {
        if (formError) { formError.textContent = ''; formError.style.display = 'none'; }
    }

    // ── Quick Verify → POST /api/documents/verify ─────────────────
    const verifyForm = $('verifyForm');
    const verifyResult = $('verifyResult');
    const verifyErrEl = $('verifyError');

    if (verifyForm) {
        verifyForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            if (verifyResult) verifyResult.classList.remove('show');
            if (verifyErrEl) { verifyErrEl.style.display = 'none'; verifyErrEl.textContent = ''; }

            const identity_no = $('verifyEnrollment')?.value.trim();
            const dob = $('verifyDob')?.value;
            const doc_type = document.querySelector('#verifyDocType')?.value || 'aadhaar';

            if (!identity_no || !dob) {
                if (verifyErrEl) { verifyErrEl.textContent = t('enter_both_fields'); verifyErrEl.style.display = 'block'; }
                return;
            }

            const btn = verifyForm.querySelector('.btn-verify');
            if (btn) { btn.disabled = true; btn.textContent = t('verifying'); }

            try {
                const res = await fetch('/api/documents/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identity_no, dob, doc_type }),
                });
                const data = await res.json();

                if (verifyResult) {
                    verifyResult.classList.add('show');
                    const iconEl = $('vrIcon');
                    const textEl = $('vrText');
                    if (data.verified) {
                        verifyResult.className = 'verify-result vr-success show';
                        if (iconEl) iconEl.textContent = '✅';
                        if (textEl) textEl.innerHTML = `<strong>${t('authentic')}</strong> — ${esc(data.holderName)} ${t('verified_via')} ${esc(data.authority)}`;
                    } else {
                        verifyResult.className = 'verify-result vr-fail show';
                        if (iconEl) iconEl.textContent = '❌';
                        const reason = data.reason === 'NOT_FOUND' ? t('not_found_reason') : t('hash_mismatch_reason');
                        if (textEl) textEl.innerHTML = `<strong>${t('not_verified')}</strong> — ${reason}`;
                    }
                }
            } catch {
                if (verifyErrEl) { verifyErrEl.textContent = t('cannot_connect_server'); verifyErrEl.style.display = 'block'; }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg> ${t('verify_identity')}`;
                }
            }
        });
    }

    function esc(t) { const d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML; }

    // ── Modal ─────────────────────────────────────────────────────
    function showModal() { successModal?.classList.add('active'); document.body.style.overflow = 'hidden'; }
    function hideModal() { successModal?.classList.remove('active'); document.body.style.overflow = ''; }
    $('modalClose')?.addEventListener('click', hideModal);
    $('modalDone')?.addEventListener('click', hideModal);
    successModal?.addEventListener('click', e => { if (e.target === successModal) hideModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideModal(); });

    // ── Scroll animations ─────────────────────────────────────────
    if ('IntersectionObserver' in window) {
        const obs = new IntersectionObserver(entries => {
            entries.forEach(e => { if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; } });
        }, { threshold: 0.1 });
        document.querySelectorAll('.stat-card').forEach(el => {
            el.style.opacity = '0'; el.style.transform = 'translateY(12px)';
            el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
            obs.observe(el);
        });
    }

    console.log('%c🇮🇳  DigiID Verify — Government of India', 'color:#1a3a6b;font-size:15px;font-weight:800');
    console.log('%cMeitY / NIC | /api/documents connected', 'color:#FF6B00;font-size:11px;font-weight:600');
})();
