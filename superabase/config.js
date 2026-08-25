/**
 * Supabase Configuration
 *
 * You can set your credentials directly here, OR enter them in the web UI.
 * Stored credentials in localStorage will automatically take precedence.
 */
const DEFAULT_CONFIG = {
  // Replace these with your Supabase project credentials if you want to hardcode them:
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: ""
};

const ConfigManager = {
  getCredentials() {
    const savedUrl = localStorage.getItem("sb_project_url");
    const savedKey = localStorage.getItem("sb_anon_key");

    return {
      url: savedUrl || DEFAULT_CONFIG.SUPABASE_URL || "",
      key: savedKey || DEFAULT_CONFIG.SUPABASE_ANON_KEY || ""
    };
  },

  saveCredentials(url, key) {
    if (url) localStorage.setItem("sb_project_url", url.trim());
    if (key) localStorage.setItem("sb_anon_key", key.trim());
  },

  clearCredentials() {
    localStorage.removeItem("sb_project_url");
    localStorage.removeItem("sb_anon_key");
  },

  isConfigured() {
    const { url, key } = this.getCredentials();
    return Boolean(url && key && url.startsWith("https://") && key.length > 20);
  }
};

window.ConfigManager = ConfigManager;
