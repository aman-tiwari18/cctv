const { query } = require('../config/database');

/**
 * CameraLink Model
 * Handles all database operations for camera links
 */
class CameraLink {
    /**
     * Create a new camera link
     */
    static async create({ exam_id, camera_id, stream_url, stream_type, location, metadata }) {
        const sql = `
      INSERT INTO camera_links (exam_id, camera_id, stream_url, stream_type, location, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
        const metadataJson = metadata ? JSON.stringify(metadata) : null;
        const result = await query(sql, [exam_id, camera_id, stream_url, stream_type, location, metadataJson]);
        return { id: result.insertId, exam_id, camera_id, stream_url, stream_type, location, metadata };
    }

    /**
     * Bulk create camera links
     */
    static async bulkCreate(cameraLinks) {
        if (!cameraLinks || cameraLinks.length === 0) {
            return [];
        }

        const sql = `
      INSERT INTO camera_links (exam_id, camera_id, stream_url, stream_type, location, metadata)
      VALUES ?
      ON DUPLICATE KEY UPDATE 
        stream_url = VALUES(stream_url),
        stream_type = VALUES(stream_type),
        location = VALUES(location),
        metadata = VALUES(metadata),
        updated_at = CURRENT_TIMESTAMP
    `;

        const values = cameraLinks.map(link => [
            link.exam_id,
            link.camera_id,
            link.stream_url,
            link.stream_type,
            link.location || null,
            link.metadata ? JSON.stringify(link.metadata) : null
        ]);

        await query(sql, [values]);
        return cameraLinks;
    }

    /**
     * Get all camera links for an exam
     */
    static async findByExamId(exam_id, { is_active = true } = {}) {
        let sql = 'SELECT * FROM camera_links WHERE exam_id = ?';
        const params = [exam_id];

        if (is_active !== null) {
            sql += ' AND is_active = ?';
            params.push(is_active);
        }

        sql += ' ORDER BY created_at DESC';
        const results = await query(sql, params);

        // Parse metadata JSON
        return results.map(link => ({
            ...link,
            metadata: link.metadata ? JSON.parse(link.metadata) : null
        }));
    }

    /**
     * Get camera link by ID
     */
    static async findById(id) {
        const sql = 'SELECT * FROM camera_links WHERE id = ?';
        const results = await query(sql, [id]);
        if (results.length === 0) return null;

        const link = results[0];
        return {
            ...link,
            metadata: link.metadata ? JSON.parse(link.metadata) : null
        };
    }

    /**
     * Update camera link
     */
    static async update(id, updates) {
        const allowedFields = ['camera_id', 'stream_url', 'stream_type', 'location', 'metadata', 'is_active'];
        const fields = [];
        const values = [];

        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                if (key === 'metadata' && updates[key]) {
                    fields.push(`${key} = ?`);
                    values.push(JSON.stringify(updates[key]));
                } else {
                    fields.push(`${key} = ?`);
                    values.push(updates[key]);
                }
            }
        });

        if (fields.length === 0) {
            throw new Error('No valid fields to update');
        }

        values.push(id);
        const sql = `UPDATE camera_links SET ${fields.join(', ')} WHERE id = ?`;
        await query(sql, values);
        return await this.findById(id);
    }

    /**
     * Delete camera link (soft delete)
     */
    static async delete(id) {
        const sql = 'UPDATE camera_links SET is_active = FALSE WHERE id = ?';
        await query(sql, [id]);
        return true;
    }

    /**
     * Get active cameras for a specific exam and stream type
     */
    static async findActiveByExamAndType(exam_id, stream_type) {
        const sql = `
      SELECT * FROM camera_links 
      WHERE exam_id = ? AND stream_type = ? AND is_active = TRUE
      ORDER BY camera_id
    `;
        const results = await query(sql, [exam_id, stream_type]);
        return results.map(link => ({
            ...link,
            metadata: link.metadata ? JSON.parse(link.metadata) : null
        }));
    }
}

module.exports = CameraLink;
