const Category = require('../Models/Category');

class CategoryController {
  static async index(req, res, next) {
    try {
      const categories = await Category.getAll();
      
      const map = new Map();
      const tree = [];

      categories.forEach(cat => map.set(cat.id, { ...cat, children: [] }));
      categories.forEach(cat => {
        if (cat.parent_id && map.has(cat.parent_id)) {
          map.get(cat.parent_id).children.push(map.get(cat.id));
        } else {
          tree.push(map.get(cat.id));
        }
      });

      return res.json({ success: true, data: tree });
    } catch (err) {
      next(err);
    }
  }

  static async show(req, res, next) {
    try {
      const category = await Category.findById(req.params.id);
      if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
      const children = await Category.getChildren(req.params.id);
      return res.json({ success: true, data: { ...category, children } });
    } catch (err) {
      next(err);
    }
  }

  static async listings(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const listings = await Category.getListingsBySubtree(req.params.id, limit);
      if (!listings) return res.status(404).json({ success: false, message: 'Category not found' });
      return res.json({ success: true, data: listings });
    } catch (err) {
      next(err);
    }
  }

  static async store(req, res, next) {
    try {
      const { name, slug, parent_id } = req.body;
      const newCategory = await Category.create({ name, slug, parent_id });
      return res.status(201).json({ success: true, data: newCategory });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const updated = await Category.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ success: false, message: 'Category not found' });
      return res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = CategoryController;