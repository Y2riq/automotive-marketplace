const db = require('../../config/database');

class Category {
  static async getAll() {
    const [rows] = await db.execute('SELECT * FROM categories ORDER BY level ASC, id ASC');
    return rows;
  }

  static async findById(id) {
    const [rows] = await db.execute('SELECT * FROM categories WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async getChildren(parentId) {
    const [rows] = await db.execute('SELECT * FROM categories WHERE parent_id = ?', [parentId]);
    return rows;
  }

  static async create({ name, slug, parent_id }) {
    let parentPath = '/';
    let level = 0;

    if (parent_id) {
      const parent = await this.findById(parent_id);
      if (!parent) throw new Error('Parent category does not exist');
      parentPath = parent.path;
      level = parent.level + 1;
    }

    const [res] = await db.execute(
      'INSERT INTO categories (name, slug, parent_id, path, level) VALUES (?, ?, ?, ?, ?)',
      [name, slug, parent_id || null, `${parentPath}tmp/`, level]
    );

    const newId = res.insertId;
    const finalPath = parent_id ? `${parentPath}${newId}/` : `/${newId}/`;

    await db.execute('UPDATE categories SET path = ? WHERE id = ?', [finalPath, newId]);
    return this.findById(newId);
  }

  static async update(id, { name, slug }) {
    await db.execute(
      'UPDATE categories SET name = COALESCE(?, name), slug = COALESCE(?, slug) WHERE id = ?',
      [name, slug, id]
    );
    return this.findById(id);
  }

  static async getListingsBySubtree(categoryId, limit = 20) {
    const category = await this.findById(categoryId);
    if (!category) return null;

    const sql = `
      SELECT l.* FROM listings l
      JOIN categories c ON l.category_id = c.id
      WHERE c.path LIKE ? AND l.deleted_at IS NULL AND l.status = 'available'
      ORDER BY l.created_at DESC
      LIMIT ?
    `;
    const [rows] = await db.query(sql, [`${category.path}%`, limit]);
    return rows;
  }
}

module.exports = Category;