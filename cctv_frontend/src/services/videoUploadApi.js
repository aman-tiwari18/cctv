/**
 * Client for the standalone "TC Video Upload Service" (Node/Express in Docker,
 * deployed on p010). It is a PRIVATE microservice — not the main cctv backend —
 * reachable over the Tailscale private network at http://100.81.36.13:8080.
 *
 * Because 100.81.36.13 is a Tailscale IP unreachable from browsers outside that
 * network, the frontend proxies through the serving nginx:
 *   Browser → /video-upload/… → nginx → http://100.81.36.13:8080/…
 * The nginx location block is in cctv_frontend/nginx.conf.
 *
 * Override via VITE_VIDEO_UPLOAD_BASE_URL for dev or direct-access scenarios.
 *
 * Endpoints used:
 *   POST /upload        multipart: tcCode + files[] → { ok, tcCode, directory,
 *                       saved_count, skipped_count, saved:[{name,size_bytes,source}],
 *                       skipped:[{file,reason}] }.  Zips are extracted server-side;
 *                       only the video files inside are kept and returned in saved[].
 *   GET  /tc/:tcCode    → { tcCode, count, directory, files:[{name,size_bytes,modified}] }
 *   GET  /stats         → { storage, tc_codes, disk:{total_gb,used_gb,free_gb,used_pct}, min_free_gb }
 *   GET  /health        → { ok, time }
 *
 * Accepted video extensions (server-side):
 *   .mov .mp4 .avi .mkv .m4v .wmv .flv .mpeg .mpg .webm .mts .m2ts .ts .3gp
 *   .3g2 .vob .ogv .mxf .dv
 *
 * Limits: 64 GB per file, 5000 files per request, only .zip archives (not
 * .rar/.7z/.tar). Duplicates are auto-suffixed (_1, _2…), never overwritten.
 */

export const VIDEO_UPLOAD_BASE = (
  import.meta.env.VITE_VIDEO_UPLOAD_BASE_URL || '/video-upload'
).replace(/\/$/, '');

/**
 * Upload one or more files for a TC code. Uses XMLHttpRequest (not fetch) so we
 * can report real upload progress via xhr.upload.onprogress — the service has no
 * resumable/chunked support, so each call must hold the connection open for the
 * whole transfer.
 *
 * Bulk upload: ALL files go in a single POST (the service accepts many files /
 * zips per request), so selecting 50 videos = one request, not 50.
 *
 * @param {string} exam    exam folder (client-slugified exam name)
 * @param {string} tcCode
 * @param {'video'|'live_image'|'uploaded_image'} kind
 * @param {File[]} files
 * @param {{ onProgress?: (pct:number, loaded:number, total:number) => void,
 *           onXhr?: (xhr:XMLHttpRequest) => void }} [opts]
 * @returns {Promise<object>} parsed success body
 */
export const uploadFiles = (exam, tcCode, kind, files, opts = {}) =>
  new Promise((resolve, reject) => {
    const { onProgress, onXhr } = opts;
    const fd = new FormData();
    fd.append('exam', String(exam));
    fd.append('tcCode', String(tcCode));
    fd.append('kind', String(kind));
    // The service ignores the field name and the client filename; it reads all
    // file parts. We send them all under "files" (matches the API doc example).
    files.forEach((f) => fd.append('files', f));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${VIDEO_UPLOAD_BASE}/upload`);
    if (typeof onXhr === 'function') onXhr(xhr);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100), e.loaded, e.total);
      }
    };
    xhr.onload = () => {
      let body = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body || {});
      } else {
        const msg = (body && (body.error || body.message))
          || (xhr.status === 507 ? 'Server storage is full' : `Upload failed (HTTP ${xhr.status})`);
        reject(Object.assign(new Error(msg), { status: xhr.status, body }));
      }
    };
    xhr.onerror = () => reject(new Error('Network error — is the upload service reachable?'));
    xhr.onabort = () => reject(Object.assign(new Error('Upload cancelled'), { aborted: true }));
    xhr.send(fd);
  });

/**
 * Per-TC summary (counts per kind) uploaded for an exam. Server-side source of
 * truth, so the list is the same on any device/session.
 * → { exam, count, tc_codes: [{ tcCode, kinds: { video:{count,size_bytes,latest_modified},
 *     live_image:{…}, uploaded_image:{…} }, total_count }] }
 */
export const listExamTcs = async (exam) => {
  const res = await fetch(`${VIDEO_UPLOAD_BASE}/exam/${encodeURIComponent(exam)}`);
  if (!res.ok) throw new Error(`Failed to list uploads (HTTP ${res.status})`);
  return res.json();
};

/**
 * Files grouped by kind for a TC code within an exam.
 * → { exam, tcCode, kinds: { video:[{name,size_bytes,modified}], live_image:[…], uploaded_image:[…] } }
 */
export const listTc = async (exam, tcCode) => {
  const res = await fetch(`${VIDEO_UPLOAD_BASE}/exam/${encodeURIComponent(exam)}/tc/${encodeURIComponent(tcCode)}`);
  if (!res.ok) throw new Error(`Failed to list files (HTTP ${res.status})`);
  return res.json();
};

/** Storage / disk usage of the upload service. */
export const getUploadStats = async () => {
  const res = await fetch(`${VIDEO_UPLOAD_BASE}/stats`);
  if (!res.ok) throw new Error(`Failed to load storage stats (HTTP ${res.status})`);
  return res.json();
};

/** Quick connectivity check — resolves to true when the service responds ok. */
export const healthCheck = async () => {
  try {
    const res = await fetch(`${VIDEO_UPLOAD_BASE}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.ok;
  } catch {
    return false;
  }
};
