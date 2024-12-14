const { existsSync, readFileSync, writeFileSync } = require('fs');
const { createServer } = require('http');

const DB_FILE = './db.json';
const URI_PREFIX = '/api/client';
const PORT = 3000;

class ClientApiError extends Error {
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

function makeClientItemFromData(data) {
    const errors = [];
    const clientItem = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        name: data.name && String(data.name),
        surname: data.surname && String(data.surname),
        lastname: data.lastname && String(data.lastname),
        contacts: data.contacts && String(data.contacts)
    };

    if (!clientItem.name) errors.push(makeError('name', 'Не указано имя клиента!'));
    if (!clientItem.surname) errors.push(makeError('surname', 'Не указана фамилия клиента!'));
    if (!clientItem.lastname) errors.push(makeError('lastname', 'Не указано отчество клиента!'));
    if (!clientItem.contacts) errors.push(makeError('contacts', 'Не указаны контакты клиента!'));

    clientItem.contacts = clientItem.contacts.replaceAll("'", '"'); //'' -> ""
    try
    {
        let check = JSON.parse(clientItem.contacts);
        if (!check.type) errors.push(makeError('contacts: { type }', 'Не указан тип контакта!'));
        if (!check.value) errors.push(makeError('contacts: { value }', 'Не указаны данные контакта!'));
    } catch (e) {
        errors.push(makeError('contacts', 'Неправильно указаны контакты клиента!'));
    }

    if (errors.length) throw new ClientApiError(422, {errors});

    return clientItem;
}

function getClientList(params = {}) {
    const clientList = JSON.parse(readFileSync(DB_FILE) || '[]');
    if (params.name && params.surname && params.lastname) return clientList.filter(({name, surname, lastname}) => (
        name === params.name &&
        surname === params.surname &&
        lastname === params.lastname
        ));
    console.log('Used getClientList');
    return clientList;
}

function createClientItem(data) {
    const newItem = makeClientItemFromData(data);
    newItem.id = Date.now().toString();
    writeFileSync(DB_FILE, JSON.stringify([...getClientList(), newItem]), {encoding: 'utf-8'});
    console.log('Used createClientItem');
    return newItem;
}

function getClientItem(clientId) {
    const clientItem = getClientList().find(({id}) => id === clientId);
    if (!clientItem) throw new ClientApiError(404, {message: 'Client Not Found'});
    console.log('Used getClientItem');
    return clientItem;
}

function updateClientItem(clientId, data) {
    const clientItems = getClientList();
    const itemIndex = clientItems.findIndex(({id}) => id === clientId);
    if (itemIndex === -1) throw new ClientApiError(404, {message: 'Client Not Found'});
    Object.assign(clientItems[itemIndex], makeClientItemFromData({...clientItems[itemIndex], ...data }));
    console.log('Used updateClientItem');
    return clientItems[itemIndex];
}

function deleteClientItem(clientId) {
    const clientItems = getClientList();
    const itemIndex = clientItems.findIndex(({id}) => id === clientId);
    if (itemIndex === -1) throw new ClientApiError(404, {message: 'Client Not Found'});
    clientItems.splice(itemIndex, 1);
    writeFileSync(DB_FILE, JSON.stringify(clientItems), {encoding: 'utf-8'});
    console.log('Used deleteClientItem');
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
                if (req.method === 'GET') return getClientList(queryParams);
                if (req.method === 'POST') {
                    const newClientItem = createClientItem(await drainJSON(req));
                    res.statusCode = 201;
                    res.setHeader('Location', `${URI_PREFIX}/${newClientItem.id}`);
                    return newClientItem;
                }
            } else {
                const clientItem = uri.substr(1);
                if (req.method === 'GET') return getClientItem(clientItem);
                if (req.method === 'PATCH') return updateClientItem(clientItem, await drainJSON(req));
                if (req.method === 'DELETE') return deleteClientItem(clientItem);
            }
            return null;
        })();
        res.end(JSON.stringify(body));
    } catch (err) {
        if (err instanceof ClientApiError) {
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