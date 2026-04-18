const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../db');

router.use(auth);   // all expense routes require login

// GET /api/expenses  — returns ALL expenses for this user (client filters by month)
router.get('/', (req, res) => {
  const rows = db.prepare(
    'SELECT id, amount, category, date, description FROM expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC'
  ).all(req.user.id);
  res.json(rows);
});

// POST /api/expenses
router.post('/', (req, res) => {
  const { id, amount, category, date, description } = req.body;
  if (!amount || !category || !date) {
    return res.status(400).json({ error: 'Montant, catégorie et date requis' });
  }
  const expId = id || Date.now().toString();
  db.prepare(
    'INSERT INTO expenses (id, user_id, amount, category, date, description) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(expId, req.user.id, Number(amount), category, date, description || '');

  res.status(201).json({ id: expId, amount: Number(amount), category, date, description: description || '' });
});

// DELETE /api/expenses/:id
router.delete('/:id', (req, res) => {
  const info = db.prepare(
    'DELETE FROM expenses WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.user.id);

  if (info.changes === 0) return res.status(404).json({ error: 'Dépense introuvable' });
  res.json({ ok: true });
});

module.exports = router;
