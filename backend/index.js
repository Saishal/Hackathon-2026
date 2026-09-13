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
