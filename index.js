#!/usr/bin/env node
require('@remy/envy'); // load .env
const detect = require('detect-port'); // move up through 5000 port
const chokidar = require('chokidar'); // watch
const chalk = require('chalk'); // coloured output
const morgan = require('morgan');
const clean = require('clean-stacktrace'); // remove internals from trace
const cors = require('cors'); // support cors by default
const { promisify } = require('util');
const p = require('path');
const { resolve } = p;
const fs = require('fs');
const stat = promisify(fs.stat);
const debug = !!process.env.DEBUG;
const cwd = process.cwd();

const relative = path => p.relative(cwd, path);

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

// modified from https://github.com/isaacs/server-destroy
function enableDestroy(server) {
  const connections = new Map();

  server.on('connection', connection => {
    const key = connection.remoteAddress + ':' + connection.remotePort;
    connections.set(key, connection);
    connection.on('close', function() {
      connections.delete(key);
    });
  });

  server.destroy = function(cb) {
    server.close((...args) => {
      connections.clear();
      cb.apply(null, args);
    });
    for (let [, connection] of connections) {
      connection.destroy();
    }
  };
}

// lifted from node-dev, but pretty straight forward: hook into node's require
// system registering each `require` and add to a map that is then monitored
const hook = (wrapper, callback) => {
  updateHooks();

  function updateHooks() {
    /* eslint-disable node/no-deprecated-api */
    Object.keys(require.extensions).forEach(ext => {
      const fn = require.extensions[ext];
      if (typeof fn === 'function' && fn.name !== '___requireHook') {
        require.extensions[ext] = createHook(fn);
      }
    });
  }

  function createHook(handler) {
    return function ___requireHook(module, filename) {
      if (module.parent === wrapper) {
        module.id = '.';
        module.parent = null;
        process.mainModule = module;
      }
      if (!module.loaded) {
        if (!module.id.includes('/node_modules/')) callback(module.filename);
      }

      // Invoke the original handler
      handler(module, filename);

      // Make sure the module did not hijack the handler
      updateHooks();
    };
  }
};

let lastRoutes = [];
const files = new Set();

hook(module, file => files.add(file));

const main = async (target, _port, first = false) => {
  const valid = await stat(target);
  if (!valid) {
    throw new Error(`Cannot find "${target}"`);
  }

  const mod = resolve(cwd, target);

  // clear all required modules that our code didn't load
  Object.keys(require.cache).forEach(path => {
    if (!path.includes(__dirname)) {
      delete require.cache[path];
    }
  });

  const app = require('express')(); // required late to reload cache
  const port = await detect(_port);
  const server = app.listen(port);

  // this ensures that outstanding connections are closed when the server
  // is destroyed
  enableDestroy(server);

  // enable cors
  app.use(cors({ origin: true, credentials: true }));
  app.options(cors({ origin: true, credentials: true }));
  app.use(morgan('dev'));

  files.clear();

  try {
    // TODO watch for required files and add them to the watching
    const router = require(mod);
    app.use(router);

    if (first)
      console.log(
        chalk.gray(`\n> Mounted on http://localhost:${port} with CORS support`)
      );

    const routes = getRoutes(router.stack, `http://localhost:${port}`);

    if (first) {
      // just dump on screen
      console.log();
      console.log(
        chalk.gray(routes.map(path => `* ${path}`).join('\n')) + '\n'
      );
    } else {
      const delta = diff(lastRoutes, routes);
      if (delta.add.length || delta.remove.length) {
        console.log();
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

  return new Promise(resolve => {
    const watcher = chokidar
      .watch(Array.from(files), { persistent: true })
      .on('change', path => {
        console.log(
          chalk.gray(
            `+ ${new Date()
              .toJSON()
              .split('T')
              .pop()
              .replace(/\..*$/, '')} reload due to ${relative(path)}`
          )
        );
        resolve(restart());
      })
      .on('error', error => console.log(chalk.red('> watch error', error)))
      .on(
        'add',
        path => debug && console.log(chalk.gray(`> watching ${relative(path)}`))
      )
      .on('ready', () => {
        if (first) {
          console.log(chalk.gray(`+ watching ${files.size} dependencies`));
        }
      });

    const restart = () =>
      new Promise(resolve => {
        watcher.close();
        server.destroy(() => {
          resolve(main(target, port));
        });
      });

    process.once('unhandledRejection', reason => {
      console.log(chalk.red(`\n× ${reason.stack}`));
      restart();
    });
  });
};

main(process.argv[2], process.env.PORT || 5000, true).catch(e => {
  console.error(clean(e.stack));
  /* eslint-disable-next-line no-process-exit */
  process.exit(1);
});
