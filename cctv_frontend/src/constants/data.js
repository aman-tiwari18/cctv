const defaultScriptServerBase =
	window.location.port === '3000' ? 'http://127.0.0.1:8000' : '/cctv_dev';

export const API_BASE_1 = (import.meta.env.VITE_SCRIPT_SERVER_BASE_URL || defaultScriptServerBase).replace(/\/$/, '');
export const API_BASE_2 = (import.meta.env.VITE_API_BASE_URL || '/cctv_analytics/api').replace(/\/$/, '');
export const IMG_BASE = API_BASE_1;

const isAbsoluteScriptServer = /^https?:\/\//i.test(API_BASE_1);
const scriptServerPath = isAbsoluteScriptServer ? new URL(API_BASE_1).pathname : API_BASE_1;

export const SOCKET_URL = isAbsoluteScriptServer ? new URL(API_BASE_1).origin : window.location.origin;
export const SOCKET_PATH = (import.meta.env.VITE_SCRIPT_SERVER_SOCKET_PATH || `${scriptServerPath.replace(/\/$/, '')}/socket.io`);