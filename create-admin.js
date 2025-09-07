// Create admin user for Node API
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function createAdminUser() {
  try {
    // Database connection
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'kitabcloud'
    });

    console.log('🔍 Connecting to database...');

    // Check if admin user already exists
    const [existing] = await connection.execute(
      'SELECT id FROM users WHERE email = ?',
      ['admin@kitabcloud.com']
    );

    if (existing.length > 0) {
      console.log('✅ Admin user already exists!');
      console.log('📧 Email: admin@kitabcloud.com');
      console.log('🔑 Password: admin123');
      await connection.end();
      return;
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const [result] = await connection.execute(
      `INSERT INTO users (full_name, email, password, phone, country, role, status, email_verified_at, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [
        'Admin User',
        'admin@kitabcloud.com',
        hashedPassword,
        '+1234567890',
        'US',
        1, // Admin role
        1  // Active status
      ]
    );

    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@kitabcloud.com');
    console.log('🔑 Password: admin123');
    console.log('🆔 User ID:', result.insertId);

    await connection.end();
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  }
}

createAdminUser();
