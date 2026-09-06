/**
 * Single source of truth for exam bodies / companies.
 *
 * Exposed publicly via GET /api/auth/companies so the registration form
 * (company dropdown) and the exam form (exam body dropdown) stay in sync.
 *
 * - company:  selectable as a company on the registration form
 * - examBody: selectable as an exam body on the exam form
 */
const EXAM_BODIES = [
    { code: "EY", label: "EY(Ernst & Young)", company: true, examBody: true },
    { code: "SSC", label: "SSC(Staff Selection Commission)", company: true, examBody: true },
    { code: "TCS", label: "TCS(Tata Consultancy Services)", company: true, examBody: true },
    { code: "NTA", label: "NTA(National Testing Agency)", company: true, examBody: true },
    { code: "UPCISB", label: "UPCISB", company: true, examBody: true },
    { code: "CDIS", label: "CDIS", company: true, examBody: false },
];

const COMPANY_CODES = EXAM_BODIES.filter((b) => b.company).map((b) => b.code);
const EXAM_BODY_CODES = EXAM_BODIES.filter((b) => b.examBody).map((b) => b.code);

/** Human-readable name for a stored company/exam-body code (falls back to the code). */
const labelForCode = (code) => {
    const key = String(code || "").trim();
    if (!key) return "";
    const match = EXAM_BODIES.find((b) => b.code.toLowerCase() === key.toLowerCase());
    return match ? match.label : key;
};

module.exports = { EXAM_BODIES, COMPANY_CODES, EXAM_BODY_CODES, labelForCode };
