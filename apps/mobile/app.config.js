// app.json plus one build-time setting: EXPO_BASE_URL serves the website under a sub-path
// (GitHub Pages: https://<user>.github.io/driving). Empty (Docker, phones): served from the root.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL && process.env.EXPO_BASE_URL !== '/' ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
