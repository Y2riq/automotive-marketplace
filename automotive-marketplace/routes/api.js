const express = require('express');
const router = express.Router();

const ListingController = require('../app/Controllers/ListingController');
const CategoryController = require('../app/Controllers/CategoryController');
const FilterController = require('../app/Controllers/FilterController');

// Listings Endpoints
router.post('/listings', ListingController.store);
router.get('/listings', ListingController.index);
router.get('/listings/search', ListingController.search);           
router.get('/listings/search/suggest', ListingController.suggest);   
router.get('/listings/:id', ListingController.show);
router.patch('/listings/:id', ListingController.update);
router.delete('/listings/:id', ListingController.destroy);

// Search & Filters Endpoints
router.get('/filters', FilterController.index);
router.get('/filters/:categoryId', FilterController.show);

// Categories Endpoints
router.get('/categories', CategoryController.index);
router.post('/categories', CategoryController.store);
router.get('/categories/:id', CategoryController.show);
router.patch('/categories/:id', CategoryController.update);
router.get('/categories/:id/listings', CategoryController.listings);

module.exports = router;