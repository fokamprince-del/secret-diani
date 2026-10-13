// Charge la configuration de test avant l'import des modules applicatifs (comme les points
// d'entrée de l'application : voir src/config/env-file.ts).
process.env.NODE_ENV = 'test';
// require et non import : un import serait remonté avant l'affectation de NODE_ENV.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('../../src/config/env-file');
