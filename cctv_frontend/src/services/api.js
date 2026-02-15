import axios from 'axios';

// Create axios instance with base URL
const api = axios.create({
    baseURL: 'http://localhost:3000/api'
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
        if (error.response && error.response.status === 401) {
            // Clear token and redirect to login on 401
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export const authAPI = {
    login: (credentials) => api.post('/auth/login', credentials),
    getCurrentUser: () => api.get('/auth/me')
};

export const examsAPI = {
    getAll: (params) => api.get('/exams', { params }),
    getById: (id) => api.get(`/exams/${id}`),
    create: (examData) => api.post('/exams', examData),
    update: (id, examData) => api.put(`/exams/${id}`, examData),
    delete: (id) => api.delete(`/exams/${id}`)
};

export const camerasAPI = {
    getAll: (examId) => api.get(`/exams/${examId}/cameras`),
    create: (examId, cameraData) => api.post(`/exams/${examId}/cameras`, cameraData),
    upload: (examId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/exams/${examId}/cameras/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    update: (id, cameraData) => api.put(`/cameras/${id}`, cameraData),
    delete: (id) => api.delete(`/cameras/${id}`)
};

export const schedulesAPI = {
    getAll: (examId) => api.get(`/exams/${examId}/schedules`),
    create: (examId, scheduleData) => api.post(`/exams/${examId}/schedules`, scheduleData),
    upload: (examId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/exams/${examId}/schedules/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    update: (id, scheduleData) => api.put(`/schedules/${id}`, scheduleData),
    delete: (id) => api.delete(`/schedules/${id}`),
    getUpcoming: (hours = 24) => api.get(`/schedules/upcoming?hours=${hours}`)
};

export const analyticsAPI = {
    getAll: (examId) => api.get(`/exams/${examId}/analytics`),
    create: (examId, taskData) => api.post(`/exams/${examId}/analytics`, taskData),
    upload: (examId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/exams/${examId}/analytics/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    update: (id, taskData) => api.put(`/analytics/${id}`, taskData),
    delete: (id) => api.delete(`/analytics/${id}`)
};

export const scriptsAPI = {
    getAll: () => api.get('/scripts')
};

export const executionsAPI = {
    getAll: (params) => api.get('/executions', { params }),
    getById: (id) => api.get(`/executions/${id}`),
    getStatistics: (params) => api.get('/executions/stats/summary', { params }),
    getByShift: (shiftId, params) => api.get(`/shifts/${shiftId}/executions`, { params }),
    getRecent: (limit = 20) => api.get(`/executions/recent?limit=${limit}`)
};

export const shiftScriptsAPI = {
    getByShift: (shiftId, params) => api.get(`/shifts/${shiftId}/scripts`, { params }),
    getByExam: (examId, params) => api.get(`/exams/${examId}/shift-scripts`, { params }),
    assign: (shiftId, scriptData) => api.post(`/shifts/${shiftId}/scripts`, scriptData),
    bulkAssign: (shiftId, scripts) => api.post(`/shifts/${shiftId}/scripts/bulk`, { scripts }),
    update: (id, data) => api.put(`/shift-scripts/${id}`, data),
    delete: (id) => api.delete(`/shift-scripts/${id}`)
};

export default api;
