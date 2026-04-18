require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

app.use(express.json());
app.use(cors());

// Serve the frontend (index.html, styles.css, app.js) from this folder
app.use(express.static(path.join(__dirname)));

// API routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/budgets',  require('./routes/budgets'));
app.use('/api/settings', require('./routes/settings'));

// SPA fallback — always serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀  FinTrack running → http://localhost:${PORT}\n`);
});
