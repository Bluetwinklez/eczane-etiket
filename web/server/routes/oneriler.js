const express = require('express');
const { oneriler } = require('../oneriler');

const router = express.Router();

// Akilli uyarilar: kullanicinin subesi icin stok bitis tahmini, SKT indirim onerisi, olu stok ve gun sonu ozeti
router.get('/', (req, res) => {
  res.json(oneriler(req.user.sube_id));
});

module.exports = router;
