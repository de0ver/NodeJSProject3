const { existsSync, readFileSync, writeFileSync } = require('fs');
const { createServer } = require('http');

const DB_FILE = './db.json';
const URI_PREFIX = '/api/todos';
const PORT = 3000;

class TodoApiError extends Error {
    constructor(statusCode, data) {
        super();
        this.statusCode = statusCode;
        this.data = data;
    }
}

function drainJSON(req) {
    return new Promise((resolve) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
        });
        req.on('end', () => {
            resolve(JSON.parse(data));
        });
    });
}

function makeError(field_, message_) {
    return { field: field_, message: message_ };
}

function makeTodoItemFromData(data) {
    const errors = [];
    const todoItem = {
        author: data.author && String(data.author),
        title: data.title && String(data.title),
        done: Boolean(data.done)
    };

    if (!todoItem.author) errors.push(makeError('author', 'Не указан автор для создания дела'));
    if (!todoItem.title) errors.push(makeError('title', 'Не указан текст задачи'));
    if (!todoItem.done) todoItem.done = false;

    if (errors.length) throw new TodoApiError(422, {errors});

    return todoItem;
}

function getTodoList(params = {}) {
    const todoList = JSON.parse(readFileSync(DB_FILE) || '[]');
    if (params.author) return todoList.filter(({author}) => author === params.author);
    return todoList;
}

function createTodoItem(data) {
    const newItem = makeTodoItemFromData(data);
    newItem.id = Date.now().toString();
    writeFileSync(DB_FILE, JSON.stringify([...getTodoList(), newItem]), {encoding: 'utf-8'});
    return newItem;
}

function getTodoItem(itemId) {
    const todoItem = getTodoList().find(({id}) => id === itemId);
    if (!todoItem) throw new TodoApiError(404, {message: 'TODO Item Not Found'});
    return todoItem;
}

function updateTodoItem(itemId, data) {
    const todoItems = getTodoList();
    const itemIndex = todoItems.findIndex(({id}) => id === itemId);
    if (itemIndex === -1) throw new TodoApiError(404, {message: 'TODO Item Not Found'});
    Object.assign(todoItems[itemIndex], makeTodoItemFromData({...todoItems[itemIndex], ...data }));
    return todoItems[itemIndex];
}

function deleteTodoItem(itemId) {
    const todoItems = getTodoList();
    const itemIndex = todoItems.findIndex(({id}) => id === itemId);
    if (itemIndex === -1) throw new TodoApiError(404, {message: 'TODO Item Not Found'});
    todoItems.splice(itemIndex, 1);
    writeFileSync(DB_FILE, JSON.stringify(todoItems), {encoding: 'utf-8'});
    return {};
}

if (!existsSync(DB_FILE)) writeFileSync(DB_FILE, '[]', {encoding: 'utf-8'});

createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.end(); return; }

    if (!req.url || !req.url.startsWith(URI_PREFIX)) {
        res.statusCode = 404;
        res.end(JSON.stringify({message: 'Not Found'}));
        return;
    }

    const [uri, query] = req.url.substr(URI_PREFIX.length).split('?');
    const queryParams = {};

    if (query) {
        for (const piece of query.split('&')) {
            const [key, value] = piece.split('=');
            queryParams[key] = value ? decodeURIComponent(value) : '';
        }
    }

    try {
        const body = await(async() => {
            if (uri === '' || uri === '/') {
                if (req.method === 'GET') return getTodoList(queryParams);
                if (req.method === 'POST') {
                    const newTodoItem = createTodoItem(await drainJSON(req));
                    res.statusCode = 201;
                    res.setHeader('Location', `${URI_PREFIX}/${newTodoItem.id}`);
                    return newTodoItem;
                }
            } else {
                const itemId = uri.substr(1);
                if (req.method === 'GET') return getTodoItem(itemId);
                if (req.method === 'PATCH') return updateTodoItem(itemId, await drainJSON(req));
                if (req.method === 'DELETE') return deleteTodoItem(itemId);
            }
            return null;
        })();
        res.end(JSON.stringify(body));
    } catch (err) {
        if (err instanceof TodoApiError) {
            res.writeHead(err.statusCode);
            res.end(JSON.stringify(err.data));
        } else {
            res.statusCode = 500;
            res.end(JSON.stringify({message: 'Server Error'}));
            console.error(err);
        }
    }
})
.on('listening', () => {
    console.log('Start...');
})
.listen(PORT);