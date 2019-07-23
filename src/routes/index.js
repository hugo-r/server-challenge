'use strict';

const Joi = require('@hapi/joi');



/**
 * @enum {State}
 */
const State = Object.freeze({
    COMPLETE: 'COMPLETE',
    INCOMPLETE: 'INCOMPLETE'
});

/**
 * @enum {OrderBy}
 */
const OrderBy = Object.freeze({
    DESCRIPTION: 'DESCRIPTION',
    DATE_ADDED: 'DATE_ADDED'
});



module.exports.routes = (server, catboxClient, internals) => {

    const CACHE_TIME = 120000;  // catbox cache ttl
    let catboxKeyIds = [];


    server.route({
        method: 'GET',
        path: '/',
        options: {
            handler: (request, reply) => {
                return internals.renderHtml.home(request.auth.credentials.name);
            }
        }
    });

    server.route({
        method: 'GET',
        path: '/login',
        options: {
            auth: {
                mode: 'try'
            },
            plugins: {
                'hapi-auth-cookie': {
                    redirectTo: false
                }
            },
            handler: async (request, reply) => {
                if (request.auth.isAuthenticated) {
                    return reply.redirect('/');
                }
                return internals.renderHtml.login();
            }
        }
    });

    server.route({
        method: 'POST',
        path: '/login',
        options: {
            auth: {
                mode: 'try'
            },
            handler: async (request, reply) => {
                const { username, password } = request.payload;
                if (!username || !password) {
                    return internals.renderHtml.login('Missing username or password');
                }

                // Try to find user with given credentials

                const account = internals.users.find((user) => {
                    return (user.name === username && user.password === password);
                }
                );
                if (!account) {
                    return internals.renderHtml.login('Invalid username or password');
                }
                request.cookieAuth.set({
                    id: account.id
                });
                return reply.redirect('/');
            }
        }
    });

    server.route({
        method: 'GET',
        path: '/logout',
        options: {
            handler: (request, reply) => {
                request.cookieAuth.clear();
                return reply.redirect('/');
            }
        }
    });

    server.route({
        method: 'GET',
        path: '/todos',
        options: {
            handler: async (request, reply) => {
                try {
                    let response = {
                        todos: []
                    };
                    await Promise.resolve(catboxKeyIds.map(
                        async (keyId) => {
                            const catboxResult = await catboxClient.get({
                                id: keyId,
                                segment: 'todos'
                            });
                            catboxResult.item.description = catboxResult.item.description;
                            response.todos.push(catboxResult.item);
                        }
                    ));
                    response.todos = filterTodos(
                        response.todos,
                        (request.query.filter)
                            ? request.query.filter
                            : "all"
                    );
                    response.todos = sortTodosBy(
                        response.todos,
                        (request.query.orderBy)
                            ? request.query.orderBy
                            : OrderBy.DATE_ADDED
                    );
                    return response;

                } catch (err) {
                    console.error(err);
                    return {};
                }
            },
            validate: {
                query: Joi.object({
                    filter: Joi.string().optional().valid(Object.keys(State)),
                    orderBy: Joi.string().optional().valid(Object.keys(OrderBy)),
                })
            }
        }
    });

    server.route({
        method: 'PUT',
        path: '/todos',
        options: {
            handler: async (request, reply) => {
                try {
                    const newTodo = {
                        id: getNextId(),
                        description: request.payload.description.trim(),
                        state: State.INCOMPLETE,
                        dateAdded: new Date()
                    };
                    const newKeyId = newTodo.id.toString();
                    catboxKeyIds.push(newKeyId);
                    const key = {
                        id: newKeyId,
                        segment: 'todos'
                    };
                    await catboxClient.set(key, newTodo, CACHE_TIME);
                    return newTodo;
                } catch (err) {
                    console.error(err);
                    return {};
                }
            },
            validate: {
                payload: Joi.object({
                    description: Joi.string().required()
                })
            }
        }
    });

    server.route({
        method: 'PATCH',
        path: '/todo/{id}',
        options: {
            handler: async (request, reply) => {
                try {
                    const keyId = request.params.id.toString();
                    const key = {
                        id: keyId,
                        segment: 'todos'
                    };
                    const catboxResult = await catboxClient.get(key);

                    if (!catboxResult) {
                        console.error(`There is no todo with id ${keyId}.`);
                        return reply.response('404 Error! Page Not Found!').code(404);
                    } else if (catboxResult.item.state === State.COMPLETE) {
                        console.error('State is already "Complete"');
                        return reply.response('State is already "Complete"').code(400);
                    }

                    const updatedTodo = {
                        id: request.params.id,
                        state: (result.state) ? result.state : catboxResult.item.state,
                        description: (result.description) ? result.description : catboxResult.item.description,
                        dateAdded: catboxResult.item.dateAdded
                    };
                    await catboxClient.set(key, updatedTodo, CACHE_TIME);
                    return updatedTodo;
                } catch (err) {
                    console.error(err);
                    return reply.response({}).code(500);
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.number().integer().min(1).required()
                }),
                payload: Joi.object({
                    state: Joi.string().optional().valid(Object.keys(State)),
                    description: Joi.string().optional()
                })
            }
        }
    });

    server.route({
        method: 'DELETE',
        path: '/todo/{id}',
        options: {
            handler: async (request, reply) => {
                try {
                    const keyId = request.params.id.toString();
                    const index = catboxKeyIds.indexOf(keyId);
                    if (index !== -1) {
                        catboxKeyIds.splice(index, 1);
                        const key = {
                            id: keyId,
                            segment: 'todos'
                        };
                        await catboxClient.drop(key);
                        return {};
                    } else {
                        throw `There is no todo with id ${keyId}.`;
                    }
                } catch (err) {
                    console.error(err);
                    return reply.response('404 Error! Page Not Found!').code(404);
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.number().integer().min(1).required()
                })
            }
        }
    });

    server.route({
        method: '*',
        path: '/{any*}',
        options: {
            handler: (request, reply) => {
                return reply.response('404 Error! Page Not Found!').code(404);
            },
            plugins: {
                lout: false
            }
        }
    });
}


/**
 * Returns the next id of the todo object to be inserted in the db
 * @returns {number} next id
 */
const getNextId = (() => {
    let id = 0;
    return () => {
        return ++id;
    }
})();


/**
 * Returns filtered array of todo tasks
 * @param {Array<Object>} todosArray 
 * @param {State} filter 
 * @returns {Array<Object>} filtered todosArray
 */
const filterTodos = (todosArray, filter) => {
    switch (filter) {
        case State.COMPLETE:
            return todosArray.filter((todo) => {
                return todo.state === 'COMPLETE';
            });
        case State.INCOMPLETE:
            return todosArray.filter((todo) => {
                return todo.state === 'INCOMPLETE';
            });
        default:
            return todosArray;
    }
}

/**
 * Returns ordered array of todo tasks
 * @param {Array<Object>} todosArray 
 * @param {OrderBy} sortBy
 * @returns {Array<Object>} ordered todosArray
 */
const sortTodosBy = (todosArray, sortBy) => {
    switch (sortBy) {
        case OrderBy.DESCRIPTION:
            return todosArray.sort((prev, next) => {
                return (prev.description > next.description) ? 1 : -1;
            });
        case OrderBy.DATE_ADDED:
            return todosArray.sort((prev, next) => {
                return (prev.dateAdded > next.dateAdded) ? 1 : -1;
            });
        default:
            return todosArray;
    }
};

