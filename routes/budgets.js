const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../db');

router.use(auth);

// GET /api/budgets  — returns { category: amount, ... }
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT category, amount FROM budgets WHERE user_id = ?'
  ).all(req.user.id);

  const budgets = {};
  rows.forEach(r => { budgets[r.category] = r.amount; });
  res.json(budgets);
});

// POST /api/budgets  — upsert a category budget
router.post('/', (req, res) => {
  const { category, amount } = req.body;
  if (!category || amount == null) {
    return res.status(400).json({ error: 'Catégorie et montant requis' });
  }
  db.prepare(`
    INSERT INTO budgets (user_id, category, amount) VALUES (?, ?, ?)
    ON CONFLICT(user_id, category) DO UPDATE SET amount = excluded.amount
  `).run(req.user.id, category, Number(amount));

  res.json({ ok: true, category, amount: Number(amount) });
});

// DELETE /api/budgets/:category  — remove a budget limit
router.delete('/:category', (req, res) => {
  db.prepare('DELETE FROM budgets WHERE user_id = ? AND category = ?')
    .run(req.user.id, req.params.category);
  res.json({ ok: true });
});

module.exports = router;
