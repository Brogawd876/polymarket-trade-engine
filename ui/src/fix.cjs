const fs = require('fs');

function processFile(path) {
    if (!fs.existsSync(path)) return;
    let code = fs.readFileSync(path, 'utf8');

    // Remove API_BASE
    code = code.replace(/const API_BASE = 'http:\/\/127\.0\.0\.1:3000\/api\/operator';\n?/g, '');
    
    // Import apiFetch
    if (!code.includes('import { apiFetch }')) {
        code = code.replace(/(import.*?\n)(?!import)/s, '$1import { apiFetch } from \'../api\';\n');
    }

    // Replace basic fetches
    code = code.replace(/fetch\(`\$\{API_BASE\}\/(.*?)`\)/g, "apiFetch<any>('/api/operator/$1')");
    code = code.replace(/fetch\(`\$\{API_BASE\}\/(.*?)`, (\{[\s\S]*?\})\)/g, "apiFetch<any>('/api/operator/$1', $2)");
    
    // Special case for Promise.all in loadAll / loadInputs
    code = code.replace(/const data = await response\.json\(\);/g, "const data = response.data || {};");
    code = code.replace(/const moduleData = await moduleResponse\.json\(\);/, "const moduleData = moduleResponse.data || {};");
    code = code.replace(/const presetData = await presetResponse\.json\(\);/, "const presetData = presetResponse.data || {};");
    code = code.replace(/const fixtureData = await fixtureResponse\.json\(\);/, "const fixtureData = fixtureResponse.data || {};");
    code = code.replace(/const evidenceData = await evidenceResponse\.json\(\);/, "const evidenceData = evidenceResponse.data || {};");
    code = code.replace(/const strategyData = await strategyResponse\.json\(\);/, "const strategyData = strategyResponse.data || {};");

    fs.writeFileSync(path, code);
    console.log('Fixed', path);
}

processFile('pages/LiveReadiness.tsx');
processFile('pages/ReplayLab.tsx');
processFile('pages/StrategyLab.tsx');
