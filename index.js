#!/usr/bin/env node
const detect = require('detect-port');
const chokidar = require('chokidar');
const chalk = require('chalk');
const decache = require('decache');
const clean = require('clean-stacktrace');
const { promisify } = require('util');
const { resolve, dirname } = require('path');
const fs = require('fs');
const stat = promisify(fs.stat);

const main = async (target, _port, first = true) => {
  const valid = await stat(target);
  if (!valid) {
    throw new Error(`Cannot find "${target}"`);
  }

  const mod = resolve(process.cwd(), target);
  decache(mod);
  const router = require(mod);
  const server = require('express')();

  server.use(router);

  const dir = valid.isDirectory() ? target : dirname(target);

  const port = await detect(_port);
  server.listen(port);
  console.log(chalk.gray(`\n> Mounted on http://localhost:${port}`));
  if (first)
    console.log(
      chalk.gray(
        router.stack
          .map(_ => `- http://localhost:${port}${_.route.path}`)
          .join('\n')
      ) + '\n'
    );

  return new Promise(resolve => {
    if (first) console.log(chalk.gray(`+ watching ${dir}/*`));
    const watcher = chokidar.watch(`${dir}/*`).on('change', path => {
      console.log(chalk.gray(`+ reload due to ${path}`));
      watcher.close();
      resolve(main(target, port));
    });
  });
};

main(process.argv[2], process.env.PORT || 5000).catch(e => {
  console.error(clean(e.stack));
  process.exit(1);
});
