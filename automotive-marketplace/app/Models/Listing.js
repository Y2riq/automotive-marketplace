const db = require('../../config/database');
const CursorHelper = require('../Helpers/CursorHelper');

class Listing {
  static async create(listingData, images = [], attributes = []) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const insertListingSql = `
        INSERT INTO listings 
        (category_id, title, make, model, year, mileage, price, \`condition\`, transmission, fuel_type, color, city, province, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')
      `;
      const [res] = await conn.execute(insertListingSql, [
        listingData.category_id, listingData.title, listingData.make, listingData.model,
        listingData.year, listingData.mileage, listingData.price, listingData.condition,
        listingData.transmission, listingData.fuel_type, listingData.color, listingData.city,
        listingData.province
      ]);

      const listingId = res.insertId;

      if (images.length > 0) {
        const imgValues = images.map((img, idx) => [
          listingId, img.url, img.is_primary ? 1 : (idx === 0 ? 1 : 0), idx
        ]);
        await conn.query(
          `INSERT INTO listing_images (listing_id, url, is_primary, sort_order) VALUES ?`,
          [imgValues]
        );
      }

      if (attributes.length > 0) {
        const attrValues = attributes.map(a => [
          listingId, a.attribute_id, a.number_value || null, a.text_value || null, a.boolean_value !== undefined ? (a.boolean_value ? 1 : 0) : null
        ]);
        await conn.query(
          `INSERT INTO listing_attribute_values (listing_id, attribute_id, number_value, text_value, boolean_value) VALUES ?`,
          [attrValues]
        );
      }

      await conn.commit();
      return this.findById(listingId);
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  static async findById(id) {
    const [rows] = await db.execute(
      `SELECT l.*, c.name as category_name 
       FROM listings l
       JOIN categories c ON l.category_id = c.id
       WHERE l.id = ? AND l.deleted_at IS NULL`,
      [id]
    );
    if (!rows[0]) return null;

    const [images] = await db.execute(
      `SELECT id, url, is_primary, sort_order FROM listing_images WHERE listing_id = ? ORDER BY sort_order ASC`,
      [id]
    );

    const [attributes] = await db.execute(
      `SELECT ca.name, ca.code, ca.data_type, lav.number_value, lav.text_value, lav.boolean_value
       FROM listing_attribute_values lav
       JOIN category_attributes ca ON lav.attribute_id = ca.id
       WHERE lav.listing_id = ?`,
      [id]
    );

    return { ...rows[0], images, attributes };
  }

  static async getBrowse(params) {
    const limit = Math.min(parseInt(params.limit) || 20, 50);
    const conditions = ['l.deleted_at IS NULL', 'l.status = ?'];
    const bindings = [params.status || 'available'];

    if (params.categoryId) {
      const [cat] = await db.execute('SELECT path FROM categories WHERE id = ?', [params.categoryId]);
      if (cat[0]) {
        conditions.push(`c.path LIKE ?`);
        bindings.push(`${cat[0].path}%`);
      }
    }

    if (params.make) { conditions.push('l.make = ?'); bindings.push(params.make); }
    if (params.model) { conditions.push('l.model = ?'); bindings.push(params.model); }
    if (params.fuel_type) { conditions.push('l.fuel_type = ?'); bindings.push(params.fuel_type); }
    if (params.transmission) { conditions.push('l.transmission = ?'); bindings.push(params.transmission); }
    if (params.condition) { conditions.push('l.condition = ?'); bindings.push(params.condition); }
    if (params.city) { conditions.push('l.city = ?'); bindings.push(params.city); }
    if (params.min_price) { conditions.push('l.price >= ?'); bindings.push(params.min_price); }
    if (params.max_price) { conditions.push('l.price <= ?'); bindings.push(params.max_price); }
    if (params.min_year) { conditions.push('l.year >= ?'); bindings.push(params.min_year); }
    if (params.max_year) { conditions.push('l.year <= ?'); bindings.push(params.max_year); }

    const SORT_CONFIGS = {
      latest:          { column: 'l.created_at', direction: 'DESC', field: 'created_at' },
      created_at_desc: { column: 'l.created_at', direction: 'DESC', field: 'created_at' },
      created_at_asc:  { column: 'l.created_at', direction: 'ASC',  field: 'created_at' },
      oldest:          { column: 'l.created_at', direction: 'ASC',  field: 'created_at' },
      price_asc:       { column: 'l.price',      direction: 'ASC',  field: 'price' },
      price_desc:      { column: 'l.price',      direction: 'DESC', field: 'price' },
      year_desc:       { column: 'l.year',       direction: 'DESC', field: 'year' },
      year_asc:        { column: 'l.year',       direction: 'ASC',  field: 'year' },
      mileage_asc:     { column: 'l.mileage',    direction: 'ASC',  field: 'mileage' },
      mileage_desc:    { column: 'l.mileage',    direction: 'DESC', field: 'mileage' },
    };

    const sortKey = (params.sort && SORT_CONFIGS[params.sort]) ? params.sort : 'created_at_desc';
    const sortConfig = SORT_CONFIGS[sortKey];

    if (params.cursor) {
      const decoded = CursorHelper.decode(params.cursor);
      const sortVal = decoded.sortVal ?? decoded.createdAt;
      const id = decoded.id;
      if (sortConfig.direction === 'DESC') {
        conditions.push(`(${sortConfig.column} < ? OR (${sortConfig.column} = ? AND l.id < ?))`);
      } else {
        conditions.push(`(${sortConfig.column} > ? OR (${sortConfig.column} = ? AND l.id > ?))`);
      }
      bindings.push(sortVal, sortVal, id);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    bindings.push(limit + 1);

    const query = `
      SELECT l.id, l.title, l.make, l.model, l.year, l.price, l.mileage,
             l.condition, l.transmission, l.fuel_type, l.city, l.province, l.status, l.created_at,
             c.name as category_name,
             (SELECT url FROM listing_images WHERE listing_id = l.id AND is_primary = 1 LIMIT 1) as primary_image
      FROM listings l
      JOIN categories c ON l.category_id = c.id
      ${whereClause}
      ORDER BY ${sortConfig.column} ${sortConfig.direction}, l.id ${sortConfig.direction}
      LIMIT ?
    `;

    const [rows] = await db.query(query, bindings);
    const hasNextPage = rows.length > limit;
    const records = hasNextPage ? rows.slice(0, limit) : rows;

    const nextCursor = (hasNextPage && records.length > 0)
      ? CursorHelper.encode({
          sortVal: records[records.length - 1][sortConfig.field],
          id: records[records.length - 1].id,
          sortKey,
        })
      : null;

    return { records, nextCursor, hasNextPage, currentSort: sortKey };
  }

  static async searchFullText(keyword, filters = {}) {
    const limit = Math.min(parseInt(filters.limit) || 20, 50);
    const conditions = ['l.deleted_at IS NULL', 'l.status = ?'];
    const bindings = [filters.status || 'available'];

    let joinCategory = '';
    if (filters.categoryId) {
      const [cat] = await db.execute('SELECT path FROM categories WHERE id = ?', [filters.categoryId]);
      if (cat[0]) {
        joinCategory = 'JOIN categories c ON l.category_id = c.id';
        conditions.push('c.path LIKE ?');
        bindings.push(`${cat[0].path}%`);
      }
    }

    let selectScore = '';
    let orderBy = 'l.created_at DESC';

    if (keyword && keyword.trim() !== '') {
      conditions.push(`MATCH(l.title, l.make, l.model, l.city) AGAINST (? IN BOOLEAN MODE)`);
      bindings.push(`${keyword.trim()}*`);
      selectScore = `, MATCH(l.title, l.make, l.model, l.city) AGAINST (? IN BOOLEAN MODE) as score`;
      bindings.unshift(`${keyword.trim()}*`);
      orderBy = 'score DESC';
    }

    if (filters.make) { conditions.push('l.make = ?'); bindings.push(filters.make); }
    if (filters.model) { conditions.push('l.model = ?'); bindings.push(filters.model); }
    if (filters.fuel_type) { conditions.push('l.fuel_type = ?'); bindings.push(filters.fuel_type); }
    if (filters.transmission) { conditions.push('l.transmission = ?'); bindings.push(filters.transmission); }
    if (filters.condition) { conditions.push('l.condition = ?'); bindings.push(filters.condition); }
    if (filters.city) { conditions.push('l.city = ?'); bindings.push(filters.city); }
    if (filters.min_price) { conditions.push('l.price >= ?'); bindings.push(filters.min_price); }
    if (filters.max_price) { conditions.push('l.price <= ?'); bindings.push(filters.max_price); }
    if (filters.min_year) { conditions.push('l.year >= ?'); bindings.push(filters.min_year); }
    if (filters.max_year) { conditions.push('l.year <= ?'); bindings.push(filters.max_year); }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const queryBindings = [...bindings, limit];
    const sql = `
      SELECT l.id, l.title, l.make, l.model, l.year, l.price, l.mileage,
             l.condition, l.transmission, l.fuel_type, l.city, l.province, l.created_at
             ${selectScore},
             (SELECT url FROM listing_images WHERE listing_id = l.id AND is_primary = 1 LIMIT 1) as primary_image
      FROM listings l
      ${joinCategory}
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ?
    `;

    const [records] = await db.query(sql, queryBindings);

    const facetBindings = (keyword && keyword.trim() !== '') ? bindings.slice(1) : bindings;

    const [facetMakes] = await db.query(`
      SELECT l.make, COUNT(*) as count 
      FROM listings l ${joinCategory} ${whereClause} 
      GROUP BY l.make ORDER BY count DESC LIMIT 10
    `, facetBindings);

    const [facetFuels] = await db.query(`
      SELECT l.fuel_type, COUNT(*) as count 
      FROM listings l ${joinCategory} ${whereClause} 
      GROUP BY l.fuel_type ORDER BY count DESC
    `, facetBindings);

    const [facetTransmissions] = await db.query(`
      SELECT l.transmission, COUNT(*) as count 
      FROM listings l ${joinCategory} ${whereClause} 
      GROUP BY l.transmission ORDER BY count DESC
    `, facetBindings);

    const [stats] = await db.query(`
      SELECT MIN(l.price) as min_price, MAX(l.price) as max_price,
             MIN(l.year) as min_year, MAX(l.year) as max_year
      FROM listings l ${joinCategory} ${whereClause}
    `, facetBindings);

    return {
      records,
      facets: {
        makes: facetMakes,
        fuel_types: facetFuels,
        transmissions: facetTransmissions,
        price_range: {
          min: Number(stats[0]?.min_price || 0),
          max: Number(stats[0]?.max_price || 0),
        },
        year_range: {
          min: Number(stats[0]?.min_year || 0),
          max: Number(stats[0]?.max_year || 0),
        },
      }
    };
  }

  static async getSuggestions(query) {
    if (!query || query.length < 2) return [];
    const pattern = `${query}%`;
    const sql = `
      (SELECT DISTINCT make as suggestion, 'make' as type FROM listings WHERE make LIKE ? AND deleted_at IS NULL LIMIT 5)
      UNION
      (SELECT DISTINCT model as suggestion, 'model' as type FROM listings WHERE model LIKE ? AND deleted_at IS NULL LIMIT 5)
      UNION
      (SELECT DISTINCT city as suggestion, 'city' as type FROM listings WHERE city LIKE ? AND deleted_at IS NULL LIMIT 5)
      LIMIT 10
    `;
    const [rows] = await db.execute(sql, [pattern, pattern, pattern]);
    return rows;
  }

  static async update(id, updateData) {
    delete updateData.id;
    delete updateData.created_at;
    const fields = Object.keys(updateData).map(k => `\`${k}\` = ?`).join(', ');
    const values = [...Object.values(updateData), id];

    await db.execute(`UPDATE listings SET ${fields} WHERE id = ? AND deleted_at IS NULL`, values);
    return this.findById(id);
  }

  static async softDelete(id) {
    const [result] = await db.execute(
      `UPDATE listings SET status = 'removed', deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return result.affectedRows > 0;
  }
}

module.exports = Listing;