// Local development entry point: `npm start`
try { require('fs').readFileSync('.env', 'utf8').split(/\r?\n/).forEach(l => {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}); } catch (_) {}
const app = require('./api/index');
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ParkEasy running on http://localhost:${port}`));
