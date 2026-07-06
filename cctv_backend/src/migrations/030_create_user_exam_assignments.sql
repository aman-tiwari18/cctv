CREATE TABLE IF NOT EXISTS user_exam_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    exam_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_exam (user_id, exam_id),
    CONSTRAINT fk_uea_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_uea_exam FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
