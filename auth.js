/**
 * auth.js — SolarEdge Pro Authentication Helper
 * Shared between login.html and index.html
 */

const AUTH_KEY   = 'solar_auth';
const USER_KEY   = 'solar_user';
const AVATAR_KEY = 'solar_avatar';

const DEFAULT_USER = {
  name:  'Admin',
  email: 'admin@solaredge.th',
  role:  'ผู้ดูแลระบบ',
  phone: '081-234-5678',
};

/**
 * Redirect to login.html if not authenticated.
 * Call this at the top of any protected page.
 */
function checkAuth() {
  if (!localStorage.getItem(AUTH_KEY)) {
    window.location.href = 'login.html';
  }
}

/**
 * Return the saved user object, or the default user.
 * @returns {Object}
 */
function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : { ...DEFAULT_USER };
  } catch {
    return { ...DEFAULT_USER };
  }
}

/**
 * Save the user object to localStorage.
 * @param {Object} user
 */
function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Clear auth state and redirect to login.html.
 */
function logout() {
  localStorage.removeItem(AUTH_KEY);
  window.location.href = 'login.html';
}

/**
 * Return avatar data URL or null.
 * @returns {string|null}
 */
function getAvatar() {
  return localStorage.getItem(AVATAR_KEY) || null;
}

/**
 * Save avatar data URL to localStorage.
 * @param {string} dataURL
 */
function saveAvatar(dataURL) {
  localStorage.setItem(AVATAR_KEY, dataURL);
}

/**
 * Return initials from a display name string.
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Sync all .avatar elements in the page with saved avatar / initials.
 */
function syncAvatarUI() {
  const avatarEls = document.querySelectorAll('.avatar');
  const avatarUrl = getAvatar();
  const user      = getUser();
  const initials  = getInitials(user.name);

  avatarEls.forEach(el => {
    if (avatarUrl) {
      el.style.backgroundImage = `url('${avatarUrl}')`;
      el.style.backgroundSize  = 'cover';
      el.style.backgroundPosition = 'center';
      el.innerHTML = '';
    } else {
      el.style.backgroundImage = '';
      el.innerHTML = `<span>${initials}</span>`;
    }
  });
}
