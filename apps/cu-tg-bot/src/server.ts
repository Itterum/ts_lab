declare global {
    var CLICKUP_TOKEN: string;
    var TEAM_ID: string;
}

globalThis.CLICKUP_TOKEN = '';
globalThis.TEAM_ID = '';

import express from 'express';
import './reposting/index';

const app = express();
app.use(express.json());

const PORT = 8080;

app.get('/', (req, res) => {
    res.send('Test bot');
});

app.listen(PORT, () => {
    console.log(`The application is listening on port ${PORT}!`);
});
