const db = require('../../config/database');

class Filter {
  static async getGlobalFacets() {
    const baseWhere = 'deleted_at IS NULL AND status = "available"';

    const [makes] = await db.execute(`
      SELECT make, COUNT(*) as count 
      FROM listings 
      WHERE ${baseWhere} 
      GROUP BY make 
      ORDER BY count DESC 
      LIMIT 15
    `);

    const [fuels] = await db.execute(`
      SELECT fuel_type, COUNT(*) as count 
      FROM listings 
      WHERE ${baseWhere} 
      GROUP BY fuel_type
    `);

    const [transmissions] = await db.execute(`
      SELECT transmission, COUNT(*) as count 
      FROM listings 
      WHERE ${baseWhere} 
      GROUP BY transmission
    `);

    const [metrics] = await db.execute(`
      SELECT MIN(price) as min_price, MAX(price) as max_price,
             MIN(year) as min_year, MAX(year) as max_year
      FROM listings 
      WHERE ${baseWhere}
    `);

    return {
      makes,
      fuel_types: fuels,
      transmissions,
      metrics: metrics[0],
    };
  }

  static async getCategoryAttributes(categoryId) {
    const [attributes] = await db.execute(
      `SELECT * FROM category_attributes WHERE category_id = ? AND is_filterable = 1`,
      [categoryId]
    );

    if (attributes.length === 0) return [];

    const attrIds = attributes.map(a => a.id);
    const [options] = await db.query(
      `SELECT * FROM attribute_options WHERE attribute_id IN (?)`,
      [attrIds]
    );

    return attributes.map(attr => ({
      ...attr,
      options: options.filter(opt => opt.attribute_id === attr.id),
    }));
  }
}

module.exports = Filter;