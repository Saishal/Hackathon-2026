// Server entry point: prepare the database (schema, migrations, demo seed when empty), clear sessions
// that expired while the server was down, then start listening. app.js builds the HTTP app separately
// so tests can run it without a real port or database file.
const { createApp } = require('./app');
const { initializeDatabase } = require('./data');
const { loadConfig } = require('./config');
const { purgeExpiredSessions } = require('./security/sessions');

const PORT = process.env.PORT || 4000;
const config = loadConfig();

initializeDatabase({ config })
  .then(async () => {
    await purgeExpiredSessions();
    createApp({ config }).listen(PORT, () => {
      console.log(`Keystone backend listening on port ${PORT} (${config.environment} environment)`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database', error);
    process.exit(1);
  });
