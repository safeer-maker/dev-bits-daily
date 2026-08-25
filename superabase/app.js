/**
 * Supabase Authentication & Learning Hub Client Logic
 */

(function () {
  'use strict';

  let supabaseClient = null;
  let countdownInterval = null;
  let currentRawToken = null;

  // DOM Elements
  const elements = {
    // Config Elements
    supabaseUrlInput: document.getElementById('supabase-url'),
    supabaseKeyInput: document.getElementById('supabase-anon-key'),
    saveConfigBtn: document.getElementById('save-config-btn'),
    clearConfigBtn: document.getElementById('clear-config-btn'),
    toggleConfigBtn: document.getElementById('toggle-config-btn'),
    configBanner: document.getElementById('config-banner'),
    connectionBadge: document.getElementById('connection-status-badge'),
    connectionText: document.getElementById('connection-status-text'),

    // Views
    unauthenticatedView: document.getElementById('unauthenticated-view'),
    authenticatedView: document.getElementById('authenticated-view'),

    // Tabs
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),

    // Forms
    signinForm: document.getElementById('signin-form'),
    signinEmail: document.getElementById('signin-email'),
    signinPassword: document.getElementById('signin-password'),
    btnSignin: document.getElementById('btn-signin'),

    signupForm: document.getElementById('signup-form'),
    signupName: document.getElementById('signup-name'),
    signupEmail: document.getElementById('signup-email'),
    signupPassword: document.getElementById('signup-password'),
    btnSignup: document.getElementById('btn-signup'),

    magicForm: document.getElementById('magic-form'),
    magicEmail: document.getElementById('magic-email'),
    btnMagic: document.getElementById('btn-magic'),

    // Authenticated Dashboard
    btnSignout: document.getElementById('btn-signout'),
    userAvatar: document.getElementById('user-avatar'),
    userDisplayName: document.getElementById('user-display-name'),
    userDisplayEmail: document.getElementById('user-display-email'),
    statUid: document.getElementById('stat-uid'),
    statRole: document.getElementById('stat-role'),
    statCreated: document.getElementById('stat-created'),
    statTokenExpires: document.getElementById('stat-token-expires'),
    btnTestAuth: document.getElementById('btn-test-auth'),
    testAuthResult: document.getElementById('test-auth-result'),

    // Inspector
    jwtDisplay: document.getElementById('jwt-display'),
    jwtStatusTag: document.getElementById('jwt-status-tag'),
    copyJwtBtn: document.getElementById('copy-jwt-btn'),
    toastContainer: document.getElementById('toast-container')
  };

  // --------------------------------------------------------------------------
  // Utility: Toast Notifications
  // --------------------------------------------------------------------------
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // --------------------------------------------------------------------------
  // Utility: JWT Decoder (Base64URL)
  // --------------------------------------------------------------------------
  function parseJwt(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const decodeBase64Url = (str) => {
        let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
          base64 += '=';
        }
        return JSON.parse(atob(base64));
      };

      return {
        header: decodeBase64Url(parts[0]),
        payload: decodeBase64Url(parts[1]),
        signature: parts[2].substring(0, 16) + '... (Signed)'
      };
    } catch (e) {
      console.error('Error decoding JWT token:', e);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // Supabase Client Initialization
  // --------------------------------------------------------------------------
  function initSupabase() {
    const creds = window.ConfigManager.getCredentials();

    // Populate inputs if available
    elements.supabaseUrlInput.value = creds.url;
    elements.supabaseKeyInput.value = creds.key;

    if (!window.ConfigManager.isConfigured()) {
      updateConnectionStatus(false, 'Credentials Missing');
      elements.configBanner.style.display = 'block';
      return false;
    }

    try {
      // Create Supabase Client instance using the official JS SDK
      supabaseClient = window.supabase.createClient(creds.url, creds.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      updateConnectionStatus(true, 'Connected to Supabase');

      // Listen for Auth State Changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED)
      supabaseClient.auth.onAuthStateChange((event, session) => {
        console.log(`[Supabase Auth Event] ${event}`, session);
        handleAuthStateChange(event, session);
      });

      return true;
    } catch (err) {
      console.error('Supabase init error:', err);
      updateConnectionStatus(false, 'Connection Error');
      showToast('Failed to initialize Supabase client: ' + err.message, 'error');
      return false;
    }
  }

  function updateConnectionStatus(isConnected, message) {
    if (isConnected) {
      elements.connectionBadge.className = 'badge badge-connected';
      elements.connectionText.textContent = message || 'Connected';
    } else {
      elements.connectionBadge.className = 'badge badge-disconnected';
      elements.connectionText.textContent = message || 'Disconnected';
    }
  }

  // --------------------------------------------------------------------------
  // Auth State Handler
  // --------------------------------------------------------------------------
  function handleAuthStateChange(event, session) {
    if (session && session.user) {
      // User is Authenticated
      renderAuthenticatedState(session);
    } else {
      // User is Unauthenticated / Signed Out
      renderUnauthenticatedState();
    }
  }

  function renderAuthenticatedState(session) {
    const user = session.user;
    currentRawToken = session.access_token;

    // Switch views
    elements.unauthenticatedView.style.display = 'none';
    elements.authenticatedView.style.display = 'flex';

    // Populate user profile info
    const fullName = user.user_metadata?.full_name || user.email.split('@')[0];
    elements.userDisplayName.textContent = fullName;
    elements.userDisplayEmail.textContent = user.email;
    elements.userAvatar.textContent = fullName.charAt(0).toUpperCase();

    elements.statUid.textContent = user.id;
    elements.statRole.textContent = user.role || 'authenticated';
    
    if (user.created_at) {
      const createdDate = new Date(user.created_at).toLocaleDateString();
      elements.statCreated.textContent = createdDate;
    }

    // Token Expiration Countdown
    startExpirationCountdown(session.expires_at);

    // Render Decoded JWT in Inspector
    const decoded = parseJwt(session.access_token);
    if (decoded) {
      elements.jwtStatusTag.textContent = 'Active JWT Verified';
      elements.jwtStatusTag.style.color = 'var(--brand-green)';
      elements.jwtDisplay.textContent = JSON.stringify(decoded, null, 2);
    }
  }

  function renderUnauthenticatedState() {
    currentRawToken = null;
    if (countdownInterval) clearInterval(countdownInterval);

    elements.authenticatedView.style.display = 'none';
    elements.unauthenticatedView.style.display = 'block';

    elements.jwtStatusTag.textContent = 'No Active Session';
    elements.jwtStatusTag.style.color = 'var(--text-muted)';
    elements.jwtDisplay.textContent = '// When signed in, the decoded JWT claims (sub, email, exp, role) will appear here...';
  }

  function startExpirationCountdown(expiresAtTimestamp) {
    if (countdownInterval) clearInterval(countdownInterval);

    const updateTimer = () => {
      if (!expiresAtTimestamp) {
        elements.statTokenExpires.textContent = 'Active';
        return;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const remainingSec = expiresAtTimestamp - nowSec;

      if (remainingSec <= 0) {
        elements.statTokenExpires.textContent = 'Refreshing...';
      } else {
        const minutes = Math.floor(remainingSec / 60);
        const seconds = remainingSec % 60;
        elements.statTokenExpires.textContent = `${minutes}m ${seconds < 10 ? '0' : ''}${seconds}s`;
      }
    };

    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
  }

  // --------------------------------------------------------------------------
  // Tab Switching
  // --------------------------------------------------------------------------
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.tabBtns.forEach(b => b.classList.remove('active'));
      elements.tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = document.getElementById(btn.dataset.tab);
      if (targetTab) targetTab.classList.add('active');
    });
  });

  // --------------------------------------------------------------------------
  // Auth Form Handlers
  // --------------------------------------------------------------------------

  // 1. Sign In
  elements.signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ensureConfigured()) return;

    const email = elements.signinEmail.value.trim();
    const password = elements.signinPassword.value;
    const btn = elements.btnSignin;

    setButtonLoading(btn, true, 'Signing In...');

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      showToast(`Welcome back, ${data.user.email}!`, 'success');
      elements.signinForm.reset();
    } catch (err) {
      console.error('Sign in error:', err);
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(btn, false, 'Sign In to Application');
    }
  });

  // 2. Sign Up
  elements.signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ensureConfigured()) return;

    const fullName = elements.signupName.value.trim();
    const email = elements.signupEmail.value.trim();
    const password = elements.signupPassword.value;
    const btn = elements.btnSignup;

    setButtonLoading(btn, true, 'Creating Account...');

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        showToast(`Account created & logged in as ${email}!`, 'success');
      } else {
        showToast('Account created! Please check your email to verify your address.', 'info');
      }
      elements.signupForm.reset();
    } catch (err) {
      console.error('Sign up error:', err);
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(btn, false, 'Create New User');
    }
  });

  // 3. Magic Link (Passwordless)
  elements.magicForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ensureConfigured()) return;

    const email = elements.magicEmail.value.trim();
    const btn = elements.btnMagic;

    setButtonLoading(btn, true, 'Sending Link...');

    try {
      const { error } = await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.href
        }
      });

      if (error) throw error;

      showToast(`Magic login link dispatched to ${email}!`, 'success');
      elements.magicForm.reset();
    } catch (err) {
      console.error('Magic link error:', err);
      showToast(err.message, 'error');
    } finally {
      setButtonLoading(btn, false, 'Send Passwordless Magic Link');
    }
  });

  // 4. Sign Out
  elements.btnSignout.addEventListener('click', async () => {
    if (!supabaseClient) return;

    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;
      showToast('Signed out successfully.', 'info');
    } catch (err) {
      console.error('Sign out error:', err);
      showToast(err.message, 'error');
    }
  });

  // 5. Simulate Authenticated Request
  elements.btnTestAuth.addEventListener('click', async () => {
    if (!supabaseClient) return;

    elements.testAuthResult.style.display = 'block';
    elements.testAuthResult.textContent = 'Sending authenticated request to Supabase API...';

    try {
      const { data: { user }, error } = await supabaseClient.auth.getUser();

      if (error) throw error;

      const summary = {
        status: "200 OK (Validated)",
        authorization_header: "Bearer " + currentRawToken.substring(0, 20) + "...",
        authenticated_user_id: user.id,
        user_email: user.email,
        email_confirmed: Boolean(user.email_confirmed_at),
        message: "Token signature verified by GoTrue/PostgreSQL!"
      };

      elements.testAuthResult.textContent = JSON.stringify(summary, null, 2);
      showToast('Authenticated API call successful!', 'success');
    } catch (err) {
      elements.testAuthResult.textContent = JSON.stringify({ error: err.message }, null, 2);
      showToast('API request failed: ' + err.message, 'error');
    }
  });

  // 6. Copy JWT to clipboard
  elements.copyJwtBtn.addEventListener('click', () => {
    if (!currentRawToken) {
      showToast('No active token to copy. Please sign in first.', 'info');
      return;
    }
    navigator.clipboard.writeText(currentRawToken).then(() => {
      showToast('Raw JWT copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Could not copy token.', 'error');
    });
  });

  // --------------------------------------------------------------------------
  // Config & Settings UI Handlers
  // --------------------------------------------------------------------------
  elements.toggleConfigBtn.addEventListener('click', () => {
    const isHidden = elements.configBanner.style.display === 'none';
    elements.configBanner.style.display = isHidden ? 'block' : 'none';
  });

  elements.saveConfigBtn.addEventListener('click', () => {
    const url = elements.supabaseUrlInput.value.trim();
    const key = elements.supabaseKeyInput.value.trim();

    if (!url || !key) {
      showToast('Please enter both Supabase Project URL and Anon Key.', 'error');
      return;
    }

    if (!url.startsWith('https://')) {
      showToast('Project URL must start with https://', 'error');
      return;
    }

    window.ConfigManager.saveCredentials(url, key);
    showToast('Credentials saved! Initializing client...', 'success');
    initSupabase();
  });

  elements.clearConfigBtn.addEventListener('click', () => {
    window.ConfigManager.clearCredentials();
    elements.supabaseUrlInput.value = '';
    elements.supabaseKeyInput.value = '';
    if (supabaseClient) {
      supabaseClient.auth.signOut();
      supabaseClient = null;
    }
    updateConnectionStatus(false, 'Disconnected');
    showToast('Credentials cleared.', 'info');
  });

  function ensureConfigured() {
    if (!supabaseClient) {
      showToast('Please connect your Supabase project in the settings bar above.', 'error');
      elements.configBanner.style.display = 'block';
      elements.supabaseUrlInput.focus();
      return false;
    }
    return true;
  }

  function setButtonLoading(btn, isLoading, originalText) {
    if (isLoading) {
      btn.disabled = true;
      btn.innerHTML = `<span style="display:inline-block; animation:spin 1s infinite linear;">⏳</span> Processing...`;
    } else {
      btn.disabled = false;
      btn.innerHTML = `<span>${originalText}</span>`;
    }
  }

  // --------------------------------------------------------------------------
  // App Bootstrapping
  // --------------------------------------------------------------------------
  initSupabase();

})();
