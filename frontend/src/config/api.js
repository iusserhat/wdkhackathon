/**
 * API Configuration
 * Production ve development ortamları için API URL yönetimi
 */

// Vite environment variables
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const API_URL = `${API_BASE_URL}/api`;
export const API_BASE = API_BASE_URL;

// Debugging
if (import.meta.env.DEV) {
  console.log('🔗 API URL:', API_URL);
}

export default {
  API_URL,
  API_BASE,
  BASE_URL: API_BASE_URL
};

