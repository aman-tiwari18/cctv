import axios from 'axios';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || '/cctv_analytics/api';
const normalizedBaseUrl = configuredBaseUrl.replace(/\/$/, '');

const api = axios.create({
    baseURL: normalizedBaseUrl
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
            const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
            window.location.href = `${basePath}/login`;
        }
        return Promise.reject(error);
    }
);

export const authAPI = {
    login: (credentials) => api.post('/auth/login', credentials),
    getCurrentUser: () => api.get('/auth/me'),
    signup: (userData) => api.post('/auth/signup', userData),
    sendOTP: (data) => api.post('/auth/send-otp', data),
    verifyOTP: (data) => api.post('/auth/verify-otp', data),
    sendRegistrationOTP: (data) => api.post('/auth/send-registration-otp', data),
    verifyRegistrationOTP: (data) => api.post('/auth/verify-registration-otp', data),
    forgotPassword: (data) => api.post('/auth/forgot-password', data),
    resetPassword: (data) => api.post('/auth/reset-password', data),
    getAllUsers: (params) => api.get('/auth/users', { params }),
    verifyUser: (userId, data) => api.put(`/auth/verify/${userId}`, data),
    getAvailableCompanies: () => api.get('/auth/companies')
};

export const examsAPI = {
    getAll: (params) => api.get('/exams', { params }),
    getById: (id) => api.get(`/exams/${id}`),
    create: (examData) => api.post('/exams', examData),
    update: (id, examData) => api.put(`/exams/${id}`, examData),
    delete: (id) => api.delete(`/exams/${id}`),
    getDetectionCount: (id) => api.get(`/exams/${id}/detections/count`),
};

export const camerasAPI = {
    getByExam: (examId, params) => api.get(`/exams/${examId}/cameras`, { params }),
    create: (examId, cameraData) => api.post(`/exams/${examId}/cameras`, cameraData),
    uploadExcel: (examId, file, { shiftId, examDate } = {}) => {
        const formData = new FormData();
        formData.append('file', file);
        if (shiftId) formData.append('shiftId', shiftId);
        if (examDate) formData.append('examDate', examDate);
        return api.post(`/exams/${examId}/cameras/upload`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    // Download blank Excel template: type = 'hls' | 'rtsp'
    downloadTemplate: async (examId, type) => {
        const response = await api.get(`/exams/${examId}/cameras/template/${type}`, {
            responseType: 'blob',
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = type.toUpperCase() === 'HLS' ? 'HLS_Camera_Template.xlsx' : 'RTSP_Camera_Template.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },
    update: (id, cameraData, examId) => api.put(`/exams/${examId}/cameras/${id}`, cameraData),
    delete: (id, examId) => api.delete(`/exams/${examId}/cameras/${id}`),
};

export const shiftsAPI = {
    getByExam: (examId) => api.get(`/exams/${examId}/shifts`),
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
    getByExam: (examId, params) => api.get('/executions', { params: { ...params, exam_id: examId } }),
    getRecent: (limit = 20) => api.get(`/executions/recent?limit=${limit}`)
};

export const shiftScriptsAPI = {
    getByShift: (shiftId, params) => api.get(`/shifts/${shiftId}/scripts`, { params }),
    getByExam: (examId, params) => api.get(`/exams/${examId}/shift-scripts`, { params }),
    assign: (shiftId, scriptData) => api.post(`/shifts/${shiftId}/scripts`, scriptData),
    bulkAssign: (shiftId, scripts, dateOptions = {}) => api.post(`/shifts/${shiftId}/scripts/bulk`, { scripts, ...dateOptions }),
    update: (id, data) => api.put(`/shift-scripts/${id}`, data),
    delete: (id) => api.delete(`/shift-scripts/${id}`),
    bulkDelete: (payload) => api.post(`/shift-scripts/bulk-delete`, payload),
};

export const reportAPI = {
    downloadReport: (params) => api.get('/report/download', {
        params: params,
        responseType: 'blob'
    })
};

export const clientDashboardAPI = {
    getStats: (timeRange = '24h') => api.get('/client-dashboard/stats', { params: { timeRange } }),
    getCameraAccessibility: (params) => api.get('/client-dashboard/camera-accessibility', { params }),
    downloadCameraAccessibility: async (params) => {
        const response = await api.get('/client-dashboard/camera-accessibility/download', {
            params,
            responseType: 'blob',
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const filename = `Camera_Accessibility_${params.type}_${new Date().toISOString().split('T')[0]}.xlsx`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    },
    getExamBodyDetails: (examBody, params) => api.get(`/client-dashboard/exam-body/${examBody}/details`, { params })
};

export const dashboardAPI = {
    getAdminStats: (timeRange = '24h') => api.get('/dashboard/admin-stats', { params: { timeRange } })
};

export default api;
