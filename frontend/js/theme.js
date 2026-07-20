/* ============================================================
   theme.js — 主题管理
   导出：{ init, getTheme, toggleTheme }
   ============================================================ */

const themeManager = (() => {
  const STORAGE_KEY = 'gitui-theme';
  const THEME_ATTR = 'data-theme';

  /**
   * 安全读取 localStorage
   */
  function storageGet(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * 安全写入 localStorage
   */
  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 隐私模式或存储已满，静默忽略
    }
  }

  /**
   * 获取当前主题
   * @returns {'light' | 'dark'}
   */
  function getTheme() {
    const stored = storageGet(STORAGE_KEY, null);
    if (stored === 'light' || stored === 'dark') return stored;

    // 跟随系统偏好
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * 应用主题到 document
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute(THEME_ATTR, theme);

    // 切换 CSS 文件（备用方案：通过 disabled 属性控制）
    const lightEl = document.getElementById('theme-light');
    const darkEl = document.getElementById('theme-dark');
    if (lightEl && darkEl) {
      lightEl.disabled = (theme !== 'light');
      darkEl.disabled = (theme !== 'dark');
    }

    // 更新导航按钮图标
    const btn = document.getElementById('btn-theme');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀️' : '🌓';
    }
  }

  /**
   * 切换主题（light ↔ dark）
   */
  function toggleTheme() {
    const current = getTheme();
    const next = current === 'light' ? 'dark' : 'light';
    storageSet(STORAGE_KEY, next);
    applyTheme(next);
    return next;
  }

  /**
   * 初始化：应用保存的主题
   */
  function init() {
    const theme = getTheme();
    applyTheme(theme);
  }

  return { init, getTheme, toggleTheme };
})();

// 挂载到全局
window.themeManager = themeManager;
