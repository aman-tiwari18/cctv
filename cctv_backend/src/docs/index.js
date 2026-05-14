const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const load = (rel) =>
    YAML.parse(fs.readFileSync(path.join(__dirname, rel), 'utf8'));

const root = load('./openapi.yaml');
const components = load('./paths/_components.yaml');

const pathFiles = [
    'auth',
    'exams',
    'cameras',
    'executions',
    'scripts',
    'shiftScripts',
    'report',
    'sms',
    'clientDashboard',
    'dashboard',
    'health',
];

root.components = { ...(root.components || {}), ...components };
root.paths = pathFiles.reduce((acc, name) => {
    const file = path.join(__dirname, 'paths', `${name}.yaml`);
    if (!fs.existsSync(file)) return acc;
    return Object.assign(acc, YAML.parse(fs.readFileSync(file, 'utf8')));
}, {});

module.exports = root;
