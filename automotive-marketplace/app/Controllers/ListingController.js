const Listing = require('../Models/Listing');
const redis = require('../../config/redis');

class ListingController {
  static async store(req, res, next) {
    try {
      const { images = [], attributes = [], ...listingData } = req.body;
      const created = await Listing.create(listingData, images, attributes);
      
      await redis.deleteKeys('filters:*');
      await redis.deleteKeys('suggest:*');

      return res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  }

  static async index(req, res, next) {
    try {
      const result = await Listing.getBrowse(req.query);
      return res.json({
        success: true,
        data: result.records,
        pagination: {
          next_cursor: result.nextCursor,
          has_next_page: result.hasNextPage,
          sort: result.currentSort,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async show(req, res, next) {
    try {
      const listing = await Listing.findById(req.params.id);
      if (!listing) return res.status(404).json({ success: false, message: 'Listing not found' });
      return res.json({ success: true, data: listing });
    } catch (err) {
      next(err);
    }
  }

  static async update(req, res, next) {
    try {
      const updated = await Listing.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ success: false, message: 'Listing not found' });

      await redis.deleteKeys('filters:*');
      await redis.deleteKeys('suggest:*');

      return res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async destroy(req, res, next) {
    try {
      const success = await Listing.softDelete(req.params.id);
      if (!success) return res.status(404).json({ success: false, message: 'Listing not found or already deleted' });

      await redis.deleteKeys('filters:*');
      await redis.deleteKeys('suggest:*');

      return res.json({ success: true, message: 'Listing soft-deleted (status -> removed)' });
    } catch (err) {
      next(err);
    }
  }

  static async search(req, res, next) {
    try {
      const { q = '', ...filters } = req.query;
      const result = await Listing.searchFullText(q, filters);
      return res.json({
        success: true,
        count: result.records ? result.records.length : result.length,
        data: result.records || result,
        facets: result.facets || null,
      });
    } catch (err) {
      next(err);
    }
  }

  static async suggest(req, res, next) {
    try {
      const q = (req.query.q || '').trim().toLowerCase();
      const cacheKey = `suggest:${q}`;
      const suggestions = await redis.getOrSet(cacheKey, 60, () => Listing.getSuggestions(req.query.q));
      return res.json({ success: true, data: suggestions });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = ListingController;