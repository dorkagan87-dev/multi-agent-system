import axios from 'axios';
import { getSession } from 'next-auth/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const apiClient = axios.create({ baseURL: `${API_URL}/api/v1` });

// Attach JWT token from session
apiClient.interceptors.request.use(async (config) => {
  const session = await getSession();
  const token = (session as any)?.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-retry on 401 with token refresh
apiClient.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry) {
      err.config._retry = true;
      try {
        const refreshResp = await axios.post(`${API_URL}/api/v1/auth/refresh`, {}, { withCredentials: true });
        const newToken = refreshResp.data.accessToken;
        err.config.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(err.config);
      } catch {
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(err);
  },
);
