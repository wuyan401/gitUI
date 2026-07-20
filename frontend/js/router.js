/* ============================================================
   router.js — Hash 路由管理器
   导出：{ route, init }
   ============================================================ */

const router = (() => {
  /** 已注册的面板模块映射 { panelId: moduleDef } */
  const panels = {};

  /** 当前激活的面板 ID */
  let currentPanelId = null;

  /**
   * 注册一个面板模块
   * @param {object} module - { id, name, icon, init(container), cleanup() }
   */
  function register(module) {
    if (!module || !module.id) return;
    panels[module.id] = module;
  }

  /**
   * 从 URL hash 解析目标面板 ID
   * @returns {string} 'dashboard' | 'branches' | ...
   */
  function parseHash() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    return hash;
  }

  /**
   * 导航到指定面板
   * @param {string} panelId - 面板 ID
   */
  async function route(panelId) {
    // 规范化
    if (!panelId) panelId = 'dashboard';

    // 如果没有打开仓库，且目标面板需要仓库，重定向到欢迎页
    if (!window.state || !window.state.currentRepo) {
      const needsRepo = ['branches', 'history', 'diff', 'remote'];
      if (needsRepo.includes(panelId)) {
        panelId = 'dashboard';
        window.location.hash = '#dashboard';
      }
    }

    const container = document.getElementById('panel-content');
    if (!container) return;

    // 清理上一个面板
    if (currentPanelId && panels[currentPanelId] && panels[currentPanelId].cleanup) {
      try { panels[currentPanelId].cleanup(); } catch (e) { console.error('面板清理失败:', e); }
    }

    // 加载新面板
    const module = panels[panelId];
    if (module && typeof module.init === 'function') {
      container.innerHTML = '';
      try {
        await module.init(container);
      } catch (e) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><p>面板加载失败: ${e.message}</p></div>`;
        console.error('面板加载失败:', e);
      }
      currentPanelId = panelId;
    } else {
      // 未注册的面板 — 显示占位
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🚧</div>
          <p>面板 "${panelId}" 尚未实现</p>
        </div>`;
      currentPanelId = panelId;
    }

    // 更新侧边栏激活状态
    document.querySelectorAll('.panel-link').forEach(link => {
      link.classList.toggle('active', link.dataset.panel === panelId);
    });
  }

  /**
   * 监听 hashchange
   */
  function init() {
    window.addEventListener('hashchange', () => {
      route(parseHash());
    });

    // 首次加载
    route(parseHash());
  }

  return { register, route, init };
})();

// 挂载到全局
window.router = router;
