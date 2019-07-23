'use strict';

const Hapi = require('@hapi/hapi');
const Catbox = require('@hapi/catbox');
const Memory = require('@hapi/catbox-memory');
const Cookie = require('@hapi/cookie');
const Vision = require('@hapi/vision');
const Inert = require('@hapi/inert');
const Lout = require('lout');


const internals = {};

internals.users = [{
    id: 1,
    name: 'bia',
    password: 'b',
}, {
    id: 2,
    name: 'hugo',
    password: 'h',
}];

internals.renderHtml = {
    login: (message) => {
        return `
            <html><head><title>Login page</title></head><body>
            ${message ? '<h3>' + message + '</h3><br/>' : ''}
            <form method="post" action="/login">
            Username: <input type="text" name="username" required><br>
            Password: <input type="password" name="password" required><br/>
            <input type="submit" value="Login"></form>
            </body></html>
        `;
    },
    home: (name) => {
        return `
            <html><head><title>Login page</title></head><body>
            <h3>Welcome ${name}! You are logged in!</h3>
            <form method="get" action="/logout">
            <input type="submit" value="Logout">
            </form>
            </body></html>
        `;
    }
};


internals.server = async () => {

    const server = Hapi.server({
        port: 3000,
        host: 'localhost'
    });
    await server.register([Cookie, Vision, Inert, Lout]);
    server.auth.strategy('session', 'cookie', {
        cookie: {
            name: 'todos-cookie',
            password: 'C9RAXUcuFo9UojTaMuBGHBMHRpvu7W5G',
            isSecure: false         // For working via HTTP in localhost
        },
        redirectTo: '/login',
        validateFunc: async (request, session) => {
            const account = internals.users.find((user) => {
                return user.id === session.id});
            if (!account) {
                return {
                    valid: false    // Must return { valid: false } for invalid cookies
                };
            }
            return {
                valid: true,
                credentials: account
            };
        }
    });

    server.auth.default('session');

    await server.start();
    console.log('Server running on %s', server.info.uri);

    const catboxClient = new Catbox.Client(Memory);
    await catboxClient.start();

    const routes = require('./src/routes/index').routes(server, catboxClient, internals);
}


internals.start = async () => {

    try {
        await internals.server();
    }
    catch (err) {
        console.error(err.stack);
        process.exit(1);
    }
};


internals.start();