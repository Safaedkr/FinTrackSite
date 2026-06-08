const router     = require('express').Router();
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const db         = require('../db');

// ── Email transporter ─────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST,
  port:   parseInt(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
router.get('/test-email', async (req, res) => {
  try {
    await transporter.verify();
    res.json({ ok: true, message: 'Connexion SMTP réussie' });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});
// ── POST /api/auth/signup ─────────────────────
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  try {
    const hash   = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)'
    ).run(name.trim(), email.toLowerCase().trim(), hash);
    const user  = { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase().trim() };
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ user, token });
 } catch (err) {
    console.error('Email error full:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── POST /api/auth/login ──────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok)  return res.status(401).json({ error: 'Identifiants incorrects' });
  const payload = { id: user.id, name: user.name, email: user.email };
  const token   = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ user: payload, token });
});

// ── POST /api/auth/forgot-password ───────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

  // Always respond with success even if email not found (security best practice)
  if (!user) return res.json({ message: 'Si cet email existe, un lien a été envoyé.' });

  // Generate a secure random token
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  // Delete any old reset tokens for this user
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);

  // Save new token
  db.prepare(
    'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)'
  ).run(user.id, token, expiresAt);

  // Send email
  const resetLink = `${process.env.APP_URL}/reset-password?token=${token}`;
  try {
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM,
      to:      user.email,
      subject: 'FinTrack — Réinitialisation de mot de passe',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#12121a;color:#fff;border-radius:16px">
          <h2 style="color:#a29bfe;margin-bottom:8px">FinTrack</h2>
          <h3 style="margin-bottom:16px">Réinitialisation de mot de passe</h3>
          <p style="color:#a0a0b8;margin-bottom:24px">
            Bonjour ${user.name},<br><br>
            Vous avez demandé à réinitialiser votre mot de passe.
            Cliquez sur le bouton ci-dessous. Ce lien expire dans <strong style="color:#fff">1 heure</strong>.
          </p>
          <a href="${resetLink}"
             style="display:inline-block;background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:#fff;padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:600;margin-bottom:24px">
            Réinitialiser mon mot de passe
          </a>
          <p style="color:#60607a;font-size:13px">
            Si vous n'avez pas fait cette demande, ignorez cet email.<br>
            Lien : <a href="${resetLink}" style="color:#a29bfe">${resetLink}</a>
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Email error:', err.message);
    return res.status(500).json({ error: 'Impossible d\'envoyer l\'email. Vérifiez la config EMAIL dans .env' });
  }

  res.json({ message: 'Si cet email existe, un lien a été envoyé.' });
});

// ── POST /api/auth/reset-password ────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password)
    return res.status(400).json({ error: 'Token et nouveau mot de passe requis' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });

  const reset = db.prepare(
    'SELECT * FROM password_resets WHERE token = ? AND used = 0'
  ).get(token);

  if (!reset)
    return res.status(400).json({ error: 'Lien invalide ou déjà utilisé' });

  if (new Date(reset.expires_at) < new Date())
    return res.status(400).json({ error: 'Lien expiré — demandez-en un nouveau' });

  // Update password
  const hash = await bcrypt.hash(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, reset.user_id);

  // Mark token as used
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);

  res.json({ message: 'Mot de passe mis à jour avec succès' });
});

module.exports = router;
