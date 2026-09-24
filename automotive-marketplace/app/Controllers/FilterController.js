const Filter = require('../Models/Filter');
const redis = require('../../config/redis');

class FilterController {
  static async index(req, res, next) {
    try {
      const cacheKey = 'filters:global_facets';
      const facets = await redis.getOrSet(cacheKey, 120, () => Filter.getGlobalFacets());
      return res.json({ success: true, data: facets });
    } catch (err) {
      next(err);
    }
  }

  static async show(req, res, next) {
    try {
      const cacheKey = `filters:category:${req.params.categoryId}`;
      const attributes = await redis.getOrSet(cacheKey, 300, () => Filter.getCategoryAttributes(req.params.categoryId));
      return res.json({ success: true, data: attributes });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = FilterController;