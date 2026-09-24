const db = require('../../config/database');

async function runSeeder() {
  console.log('Seeding automotive marketplace data...');
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    await conn.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        parent_id INT UNSIGNED DEFAULT NULL,
        name VARCHAR(150) NOT NULL,
        slug VARCHAR(150) NOT NULL,
        path VARCHAR(255) NOT NULL,
        level INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_categories_parent_id (parent_id),
        KEY idx_categories_path (path),
        KEY idx_categories_slug (slug),
        CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS category_attributes (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        category_id INT UNSIGNED NOT NULL,
        name VARCHAR(150) NOT NULL,
        code VARCHAR(100) NOT NULL,
        data_type ENUM('number', 'text', 'boolean', 'enum') NOT NULL,
        is_filterable TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_category_attributes_category_id (category_id),
        KEY idx_category_attributes_code (code),
        CONSTRAINT fk_category_attributes_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS attribute_options (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        attribute_id INT UNSIGNED NOT NULL,
        value VARCHAR(150) NOT NULL,
        label VARCHAR(150) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_attribute_options_attribute_id (attribute_id),
        CONSTRAINT fk_attribute_options_attribute FOREIGN KEY (attribute_id) REFERENCES category_attributes (id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        category_id INT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL,
        make VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        year INT NOT NULL,
        mileage INT NOT NULL DEFAULT 0,
        price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        \`condition\` ENUM('new', 'used') NOT NULL DEFAULT 'used',
        transmission ENUM('automatic', 'manual') NOT NULL,
        fuel_type ENUM('petrol', 'diesel', 'hybrid', 'electric') NOT NULL,
        color VARCHAR(100) DEFAULT NULL,
        city VARCHAR(100) NOT NULL,
        province VARCHAR(100) DEFAULT NULL,
        status ENUM('available', 'sold', 'pending', 'removed') NOT NULL DEFAULT 'available',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_listings_category_id (category_id),
        KEY idx_listings_browse (status, deleted_at, created_at, id),
        KEY idx_listings_make (make),
        KEY idx_listings_model (model),
        KEY idx_listings_city (city),
        KEY idx_listings_price (price),
        KEY idx_listings_year (year),
        FULLTEXT KEY ft_listings_search (title, make, model, city),
        CONSTRAINT fk_listings_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS listing_images (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        listing_id INT UNSIGNED NOT NULL,
        url VARCHAR(500) NOT NULL,
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_listing_images_listing_id (listing_id),
        KEY idx_listing_images_primary (listing_id, is_primary),
        CONSTRAINT fk_listing_images_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS listing_attribute_values (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        listing_id INT UNSIGNED NOT NULL,
        attribute_id INT UNSIGNED NOT NULL,
        number_value DECIMAL(15, 2) DEFAULT NULL,
        text_value TEXT DEFAULT NULL,
        boolean_value TINYINT(1) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_lav_listing_id (listing_id),
        KEY idx_lav_attribute_id (attribute_id),
        CONSTRAINT fk_lav_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_lav_attribute FOREIGN KEY (attribute_id) REFERENCES category_attributes (id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE listing_attribute_values');
    await conn.query('TRUNCATE TABLE listing_images');
    await conn.query('TRUNCATE TABLE listings');
    await conn.query('TRUNCATE TABLE attribute_options');
    await conn.query('TRUNCATE TABLE category_attributes');
    await conn.query('TRUNCATE TABLE categories');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    const [c1] = await conn.execute('INSERT INTO categories (name, slug, path, level) VALUES ("Cars", "cars", "/1/", 0)');
    const carsId = c1.insertId;

    const [c2] = await conn.execute('INSERT INTO categories (parent_id, name, slug, path, level) VALUES (?, "SUV", "suv", ?, 1)', [carsId, `/${carsId}/2/`]);
    const suvId = c2.insertId;

    const [c3] = await conn.execute('INSERT INTO categories (parent_id, name, slug, path, level) VALUES (?, "7-Seater", "7-seater", ?, 2)', [suvId, `/${carsId}/${suvId}/3/`]);
    const suv7Id = c3.insertId;

    const [c4] = await conn.execute('INSERT INTO categories (parent_id, name, slug, path, level) VALUES (?, "Sedan", "sedan", ?, 1)', [carsId, `/${carsId}/4/`]);
    const sedanId = c4.insertId;

    const [a1] = await conn.execute('INSERT INTO category_attributes (category_id, name, code, data_type) VALUES (?, "Fuel Delivery", "fuel_delivery", "enum")', [carsId]);
    await conn.execute('INSERT INTO attribute_options (attribute_id, value, label) VALUES (?, "turbo", "Turbocharged"), (?, "na", "Naturally Aspirated")', [a1.insertId, a1.insertId]);

    const [a2] = await conn.execute('INSERT INTO category_attributes (category_id, name, code, data_type) VALUES (?, "Sunroof", "sunroof", "boolean")', [suvId]);

    const makes = {
      'Toyota': ['Fortuner', 'Innova', 'Avanza', 'Camry', 'Yaris'],
      'Honda': ['CR-V', 'HR-V', 'Civic', 'BR-V', 'City'],
      'Mitsubishi': ['Pajero Sport', 'Xforce', 'Xpander'],
      'Hyundai': ['Palisade', 'Ioniq 5', 'Creta', 'Santa Fe'],
      'BMW': ['X3', 'X5', '320i', '520i']
    };

    const cities = ['Jakarta Selatan', 'Jakarta Barat', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Tangerang'];
    const colors = ['Hitam Metalik', 'Putih Mutiara', 'Silver', 'Abu-Abu', 'Merah'];
    const transmissions = ['automatic', 'manual'];
    const fuels = ['petrol', 'diesel', 'hybrid', 'electric'];
    const catList = [carsId, suvId, suv7Id, sedanId];

    const listings = [];
    const now = Date.now();

    for (let i = 1; i <= 520; i++) {
      const makeKeys = Object.keys(makes);
      const make = makeKeys[Math.floor(Math.random() * makeKeys.length)];
      const model = makes[make][Math.floor(Math.random() * makes[make].length)];
      const year = 2014 + Math.floor(Math.random() * 11);
      const price = (120 + Math.floor(Math.random() * 980)) * 1000000;
      const cat = catList[Math.floor(Math.random() * catList.length)];
      const createdAt = new Date(now - (i * 3600000));

      listings.push([
        cat,
        `${make} ${model} ${year} Kondisi Terawat Prima`,
        make,
        model,
        year,
        Math.floor(Math.random() * 80000) + 5000,
        price,
        Math.random() > 0.25 ? 'used' : 'new',
        transmissions[Math.floor(Math.random() * transmissions.length)],
        fuels[Math.floor(Math.random() * fuels.length)],
        colors[Math.floor(Math.random() * colors.length)],
        cities[Math.floor(Math.random() * cities.length)],
        'Indonesia',
        'available',
        createdAt
      ]);
    }

    const insertListingsSql = `
      INSERT INTO listings 
      (category_id, title, make, model, year, mileage, price, \`condition\`, transmission, fuel_type, color, city, province, status, created_at)
      VALUES ?
    `;
    await conn.query(insertListingsSql, [listings]);

    const [allListings] = await conn.execute('SELECT id FROM listings');
    const images = [];
    const attrValues = [];

    allListings.forEach(l => {
      images.push([
        l.id,
        'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=800&q=80',
        1,
        0
      ]);
      attrValues.push([
        l.id,
        a2.insertId,
        null,
        null,
        Math.random() > 0.5 ? 1 : 0
      ]);
    });

    await conn.query(`INSERT INTO listing_images (listing_id, url, is_primary, sort_order) VALUES ?`, [images]);
    await conn.query(`INSERT INTO listing_attribute_values (listing_id, attribute_id, number_value, text_value, boolean_value) VALUES ?`, [attrValues]);

    await conn.commit();
    console.log(`Berhasil melakukan seed 520 records data listing.`);
    process.exit(0);
  } catch (error) {
    await conn.rollback();
    console.error('Error saat seeding:', error);
    process.exit(1);
  } finally {
    conn.release();
  }
}

runSeeder();