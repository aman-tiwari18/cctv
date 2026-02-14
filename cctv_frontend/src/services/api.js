import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

// Create axios instance
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle errors
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Unauthorized - clear token and redirect to login
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// Authentication API
export const authAPI = {
    login: (credentials) => api.post('/auth/login', credentials),
    register: (userData) => api.post('/auth/register', userData),
    getCurrentUser: () => api.get('/auth/me'),
};

// Exams API
export const examsAPI = {
    getAll: (params) => api.get('/exams', { params }),
    getById: (id) => api.get(`/exams/${id}`),
    create: (data) => api.post('/exams', data),
    update: (id, data) => api.put(`/exams/${id}`, data),
    delete: (id) => api.delete(`/exams/${id}`),
};

// Camera Links API
export const camerasAPI = {
    getByExam: (examId, params) => api.get(`/exams/${examId}/cameras`, { params }),
    create: (examId, data) => api.post(`/exams/${examId}/cameras`, data),
    uploadExcel: (examId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/exams/${examId}/cameras/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    update: (id, data) => api.put(`/cameras/${id}`, data),
    delete: (id) => api.delete(`/cameras/${id}`),
};

// Schedules API
export const schedulesAPI = {
    getByExam: (examId, params) => api.get(`/exams/${examId}/schedules`, { params }),
    create: (examId, data) => api.post(`/exams/${examId}/schedules`, data),
    uploadExcel: (examId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/exams/${examId}/schedules/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    getUpcoming: (hours = 24) => api.get('/schedules/upcoming', { params: { hours } }),
    update: (id, data) => api.put(`/schedules/${id}`, data),
    delete: (id) => api.delete(`/schedules/${id}`),
};

// Analytics Tasks API
export const analyticsAPI = {
    getByExam: (examId, params) => api.get(`/exams/${examId}/analytics`, { params }),
    create: (examId, data) => api.post(`/exams/${examId}/analytics`, data),
    uploadExcel: (examId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/exams/${examId}/analytics/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    update: (id, data) => api.put(`/analytics/${id}`, data),
    delete: (id) => api.delete(`/analytics/${id}`),
};

// Executions API
export const executionsAPI = {
    getAll: (params) => api.get('/executions', { params }),
    getById: (id) => api.get(`/executions/${id}`),
    getStatistics: (params) => api.get('/executions/stats/summary', { params }),
    getPending: (limit = 50) => api.get('/executions/pending', { params: { limit } }),
};

export default api;
