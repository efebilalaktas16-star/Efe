// Basit localStorage tabanlı depolama katmanı.
const Storage = (() => {
  const KEYS = {
    ROUTES: 'wt_routes_v1',
    ACTIVITIES: 'wt_activities_v1',
    SETTINGS: 'wt_settings_v1',
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Storage read error', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('Storage write error', key, e);
      return false;
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Routes
  function getRoutes() {
    return read(KEYS.ROUTES, []);
  }
  function saveRoute(route) {
    const routes = getRoutes();
    routes.unshift(route);
    write(KEYS.ROUTES, routes);
    return route;
  }
  function deleteRoute(id) {
    const routes = getRoutes().filter((r) => r.id !== id);
    write(KEYS.ROUTES, routes);
  }

  // Activities
  function getActivities() {
    return read(KEYS.ACTIVITIES, []);
  }
  function saveActivity(activity) {
    const activities = getActivities();
    activities.unshift(activity);
    write(KEYS.ACTIVITIES, activities);
    return activity;
  }
  function deleteActivity(id) {
    const activities = getActivities().filter((a) => a.id !== id);
    write(KEYS.ACTIVITIES, activities);
  }

  // Settings
  function getSettings() {
    return read(KEYS.SETTINGS, { weightKg: 70 });
  }
  function saveSettings(settings) {
    write(KEYS.SETTINGS, settings);
  }

  return {
    uid,
    getRoutes,
    saveRoute,
    deleteRoute,
    getActivities,
    saveActivity,
    deleteActivity,
    getSettings,
    saveSettings,
  };
})();
