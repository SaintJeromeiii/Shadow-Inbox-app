const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithRequestScope(scope, next) {
  return storage.run(scope, next);
}

function getRequestScope() {
  return storage.getStore() ?? null;
}

module.exports = {
  runWithRequestScope,
  getRequestScope,
};
