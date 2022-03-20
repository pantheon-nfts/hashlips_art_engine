// const basePath = process.cwd();
const { startCreating, buildSetup } = require(`${__dirname}/src/main.js`);

(() => {
  buildSetup();
  startCreating();
})();
