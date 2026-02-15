const { pool } = require('../config/database');
const bcrypt = require('bcryptjs');

const checkAdminUser = async () => {
    try {
        console.log('\n=== Checking Admin User ===');

        const [users] = await pool.query('SELECT * FROM users WHERE username = ?', ['admin']);

        if (users.length === 0) {
            console.log('❌ Admin user not found!');
            return;
        }

        const user = users[0];
        console.log('\n✓ Admin user found:');
        console.log('  Username:', user.username);
        console.log('  Email:', user.email);
        console.log('  Role:', user.role);
        console.log('  Password Hash:', user.password_hash);
        console.log('  Is Active:', user.is_active);

        // Test password
        const testPassword = 'admin123';
        console.log('\n=== Testing Password ===');
        console.log('Testing password:', testPassword);

        const isMatch = await bcrypt.compare(testPassword, user.password_hash);
        console.log('Password match:', isMatch ? '✓ YES' : '❌ NO');

        if (!isMatch) {
            console.log('\n=== Generating Correct Hash ===');
            const salt = await bcrypt.genSalt(10);
            const correctHash = await bcrypt.hash(testPassword, salt);
            console.log('Correct hash for "admin123":', correctHash);

            console.log('\n=== Updating Password ===');
            await pool.query('UPDATE users SET password_hash = ? WHERE username = ?', [correctHash, 'admin']);
            console.log('✓ Password updated successfully!');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
};

checkAdminUser();
