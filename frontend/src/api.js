import axios from "axios";
const API_BASE_URL = "/api";
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    let authData = null;

    try {
      const saved = localStorage.getItem("interview_auth");
      authData = saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error("Unable to read authentication data:", error);
    }

    const token = authData?.access_token;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.error(
        "Authentication failed:",
        error.response.data
      );
    }

    return Promise.reject(error);
  }
);

export default api;
