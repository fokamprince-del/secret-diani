// Charge la configuration de test avant l'import des modules applicatifs.
process.env.NODE_ENV = 'test';
process.loadEnvFile('.env.test');
