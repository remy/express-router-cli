# express-router-cli

This is a tiny utility for testing express routes.

    npm install -g express-router-cli
    # router is installed
    ❯ router ../mysite/route/api
    > Mounted on http://localhost:5001
    - http://localhost:5001/
    - http://localhost:5001/:year/:slug?

    + watching ../mysite/route/api/*

- Supports express routes. Possibly other kinds, not sure!
- Auto selects an open port from 5000 upwards
- Watches the directory of the target and auto reloads
