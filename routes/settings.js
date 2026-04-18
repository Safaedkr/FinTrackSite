const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../db');

router.use(auth);

// GET /api/settings  — salary + savings goal + custom categories in one shot
router.get('/', (req, res) => {
  const user = db.prepare(
    'SELECT salary, savings_goal FROM users WHERE id = ?'
  ).get(req.user.id);

  const categories = db.prepare(
    'SELECT id, name, emoji FROM custom_categories WHERE user_id = ?'
  ).all(req.user.id);

  res.json({
    salary:           user.salary,
    savingsGoal:      user.savings_goal,
    customCategories: categories,
  });
});

// PUT /api/settings  — update salary and/or savingsGoal
router.put('/', (req, res) => {
  const { salary, savingsGoal } = req.body;
  if (salary      != null) db.prepare('UPDATE users SET salary       = ? WHERE id = ?').run(Number(salary),      req.user.id);
  if (savingsGoal != null) db.prepare('UPDATE users SET savings_goal = ? WHERE id = ?').run(Number(savingsGoal), req.user.id);
  res.json({ ok: true });
});

// POST /api/settings/categories  — add a custom category
router.post('/categories', (req, res) => {
  const { id, name, emoji } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom de catégorie requis' });

  const catId = id || (name.toLowerCase().replace(/\s+/g, '_') + Date.now());
  db.prepare(
    'INSERT INTO custom_categories (id, user_id, name, emoji) VALUES (?, ?, ?, ?)'
  ).run(catId, req.user.id, name.trim(), emoji || '🏷️');

  res.status(201).json({ id: catId, name: name.trim(), emoji: emoji || '🏷️' });
});

// DELETE /api/settings/categories/:id
router.delete('/categories/:id', (req, res) => {
  const info = db.prepare(
    'DELETE FROM custom_categories WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.user.id);

  if (info.changes === 0) return res.status(404).json({ error: 'Catégorie introuvable' });
  res.json({ ok: true });
});

module.exports = router;
