#!/usr/bin/env node
const detect = require('detect-port');
const chokidar = require('chokidar');
const chalk = require('chalk');
const clean = require('clean-stacktrace');
const { promisify } = require('util');
const { resolve, dirname } = require('path');
const fs = require('fs');
const stat = promisify(fs.stat);

const getRoutes = (stack, root = '') => {
  return stack.reduce((acc, curr) => {
    if (curr.route && curr.route.path) {
      const path = Array.isArray(curr.route.path)
        ? curr.route.path
        : [curr.route.path];

      const method = Object.keys(curr.route.methods)
        .map(_ => _.toUpperCase())
        .shift();
      acc.push(...path.map(path => `${method.padEnd(4, ' ')} ${root}${path}`));

      return acc;
    }

    if (curr.handle.stack) {
      acc.push(
        ...getRoutes(
          curr.handle.stack,
          root +
            curr.regexp
              .toString()
              .replace(/^\/\^/, '')
              .replace(/\\\/\?\(\?=\\\/\|\$\)\/i/, '')
              .replace(/\\\//g, '/')
        )
      );
    }

    return acc;
  }, []);
};

const diff = (old, changed) => {
  const res = {
    add: [],
    remove: [],
  };

  changed.forEach(item => {
    if (!old.includes(item)) {
      res.add.push(item);
    }
  });

  old.forEach(item => {
    if (!changed.includes(item)) {
      res.remove.push(item);
    }
  });

  return res;
};

let lastRoutes = [];

const main = async (target, _port, first = false) => {
  const valid = await stat(target);
  if (!valid) {
    throw new Error(`Cannot find "${target}"`);
  }

  const mod = resolve(process.cwd(), target);
  const dir = valid.isDirectory() ? target : dirname(target);
  const root = resolve(dir);

  // clear all required modules matching the dir
  Object.keys(require.cache).forEach(path => {
    if (path.startsWith(root)) {
      delete require.cache[path];
    }
  });

  const app = require('express')();
  const port = await detect(_port);
  const server = app.listen(port);
  try {
    const router = require(mod);

    app.use(router);

    if (first)
      console.log(chalk.gray(`\n> Mounted on http://localhost:${port}`));

    const routes = getRoutes(router.stack, `http://localhost:${port}`);

    console.log();

    if (first) {
      // just dump on screen
      console.log(
        chalk.gray(routes.map(path => `* ${path}`).join('\n')) + '\n'
      );
    } else {
      const delta = diff(lastRoutes, routes);
      if (delta.add.length || delta.remove.length) {
        console.log(
          routes
            .map(path => {
              if (delta.add.includes(path)) {
                return chalk.bgGreen.white(`+ ${path}`);
              }

              return chalk.grey(`* ${path}`);
            })
            .concat(delta.remove.map(path => chalk.red(`- ${path}`)))
            .join('\n') + '\n'
        );
      }
    }

    lastRoutes = routes;
  } catch (error) {
    console.log(chalk.red(`> Failed to mount "${target}", waiting for change`));
    console.log(error);
  }

  app.use((req, res) => {
    res.send('Unknown handler or waiting for changes…');
  });

  if (first) {
    return new Promise(resolve => {
      console.log(chalk.gray(`+ watching ${dir}/*`));
      const watcher = chokidar
        .watch(`${dir}/**/*`, { persistent: true })
        .on('change', path => {
          console.log(
            chalk.gray(
              `+ reload due to ${path} @ ${new Date()
                .toJSON()
                .split('T')
                .pop()
                .replace(/\..*$/, '')}`
            )
          );
          watcher.close();
          server.close();
          resolve(main(target, port));
        });
    });
  }
};

main(process.argv[2], process.env.PORT || 5000, true).catch(e => {
  console.error(clean(e.stack));
  process.exit(1);
});
