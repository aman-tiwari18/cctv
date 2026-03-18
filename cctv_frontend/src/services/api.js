import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:3001/cctv/api'
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
    (error) => Promise.reject(error)
);

// Response interceptor to handle 401
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
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
    delete: (id) => api.delete(`/exams/${id}`),
};

export const camerasAPI = {
    getByExam: (examId, params) => api.get(`/exams/${examId}/cameras`, { params }),
    create: (examId, cameraData) => api.post(`/exams/${examId}/cameras`, cameraData),
    uploadExcel: (examId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api.post(`/exams/${examId}/cameras/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    update: (id, cameraData, examId) => api.put(`/exams/${examId}/cameras/${id}`, cameraData),
    delete: (id, examId) => api.delete(`/exams/${examId}/cameras/${id}`)
};

export const scriptsAPI = {
    getAll: (params) => api.get('/scripts', { params }),
    getById: (id) => api.get(`/scripts/${id}`),
    create: (scriptData) => api.post('/scripts', scriptData),
    update: (id, scriptData) => api.put(`/scripts/${id}`, scriptData),
    delete: (id) => api.delete(`/scripts/${id}`)
};

export const executionsAPI = {
    getAll: (params) => api.get('/executions', { params }),
    getById: (id) => api.get(`/executions/${id}`),
    getStatistics: (params) => api.get('/executions/stats/summary', { params }),
    getByShift: (shiftId, params) => api.get(`/executions/shifts/${shiftId}/executions`, { params }),
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
