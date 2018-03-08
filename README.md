# express-router-cli

This is a tiny utility for testing express routes.

```
npm install -g express-router-cli
# now the router is installed
❯ router ../mysite/route/api
> Mounted on http://localhost:5001
- http://localhost:5001/
- http://localhost:5001/:year/:slug?

+ watching ../mysite/route/api/*
```

- Includes CORS by default
- Auto selects an open port from 5000 upwards
- Watches all required files (excluding `node_modules`) and auto reloads all routes with a visual diff of new or removed routes
- Unhandled rejections will automatically restart the server, dropping existing (hanging) connections
- Supports express routes. Possibly other kinds, not sure!

## License

- [MIT](https://rem.mit-license.org)
