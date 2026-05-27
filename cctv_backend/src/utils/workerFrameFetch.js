/**
 * Helper to retrieve a classification-frame JPEG from a script-server worker.
 *
 * Why this exists:
 * - Most frames are written by workers to /app/scripts/detection/results/
 *   inside their container, which is bind-mounted to NFS (/data/nfs/cctv_images
 *   on main). Those files are readable directly on the main server.
 * - A subset of older frames were written to /app/results/<…> inside the
 *   container, which is NOT a bind mount, so the bytes only exist on the
 *   worker that produced them. For those rows we need an out-of-band fetch.
 *
 * Approach: ssh into each worker host and `docker exec <container> cat <path>`
 * the file. The first worker that returns non-empty bytes wins.
 *
 * Credentials/IPs come from env so they can be overridden without code edits.
 */

const { spawn } = require("child_process");
const logger = require("./logger");

const WORKERS = [
    {
        id: "worker-1",
        ip: process.env.WORKER_1_IP || "192.168.19.43",
        container: process.env.WORKER_1_CONTAINER || "cctv_script_server_worker_worker-1",
    },
    {
        id: "worker-2",
        ip: process.env.WORKER_2_IP || "192.168.19.42",
        container: process.env.WORKER_2_CONTAINER || "cctv_script_server_worker_worker-2",
    },
    {
        id: "worker-3",
        ip: process.env.WORKER_3_IP || "192.168.19.41",
        container: process.env.WORKER_3_CONTAINER || "cctv_script_server_worker_worker-3",
    },
];

const SSH_USER = process.env.WORKER_SSH_USER || "root";
const SSH_PASSWORD = process.env.WORKER_SSH_PASSWORD || "iitk@2026";

const SSH_OPTS = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "-o", "BatchMode=no",
    "-o", "ConnectTimeout=5",
];

const shellQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

function fetchFrameFromWorker(worker, framePath, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const remoteCmd = `docker exec ${shellQuote(worker.container)} cat ${shellQuote(framePath)}`;
        const args = [
            "-p", SSH_PASSWORD,
            "ssh", ...SSH_OPTS,
            `${SSH_USER}@${worker.ip}`,
            remoteCmd,
        ];
        const proc = spawn("sshpass", args, { stdio: ["ignore", "pipe", "pipe"] });
        const stdoutChunks = [];
        const stderrChunks = [];
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill("SIGKILL");
        }, timeoutMs);

        proc.stdout.on("data", (c) => stdoutChunks.push(c));
        proc.stderr.on("data", (c) => stderrChunks.push(c));
        proc.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
        proc.on("close", (code) => {
            clearTimeout(timer);
            if (timedOut) return reject(new Error(`ssh ${worker.id}: timeout`));
            const buf = Buffer.concat(stdoutChunks);
            if (code !== 0 || buf.length === 0) {
                const err = Buffer.concat(stderrChunks).toString("utf8").slice(0, 200);
                return reject(new Error(`ssh ${worker.id}: exit ${code} ${err}`));
            }
            resolve(buf);
        });
    });
}

async function fetchFrameFromAnyWorker(framePath, timeoutMs = 15000) {
    const errors = [];
    for (const w of WORKERS) {
        try {
            const buf = await fetchFrameFromWorker(w, framePath, timeoutMs);
            return { workerId: w.id, bytes: buf };
        } catch (e) {
            errors.push(`${w.id}: ${e.message}`);
        }
    }
    const summary = errors.join(" | ");
    logger.debug(`[workerFrameFetch] all workers failed for ${framePath}: ${summary}`);
    throw new Error(`Frame not found on any worker (${summary})`);
}

module.exports = { fetchFrameFromAnyWorker, WORKERS };
