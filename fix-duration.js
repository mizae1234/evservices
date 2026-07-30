const fs = require('fs');
const path = require('path');

const filePath = path.join('/Users/kanittamac/web/evservices/src/app/service-center/bookings/bay-booking/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

const oldLogic = `        let modelKey = cm.ModelCode;
        if (modelKey.startsWith('Y')) modelKey = 'Y PLUS';
        if (modelKey === 'YPLUS-TAXI') modelKey = 'Y PLUS TAXI';
        if (modelKey === 'ES-TAXI') modelKey = 'ES TAXI';
        if (modelKey === 'HT') modelKey = 'HYPTEC HT';
        if (modelKey === 'M8-PHEV') modelKey = 'M8 PHEV';`;

const newLogic = `        let modelKey = cm.ModelCode;
        if (cm.CarModelID >= 11 && cm.CarModelID <= 12) modelKey = 'Y PLUS TAXI'; // Y490, Y410
        else if (cm.CarModelID === 13) modelKey = 'ES TAXI'; // ES
        else if (modelKey.startsWith('Y')) modelKey = 'Y PLUS';
        else if (modelKey === 'HT') modelKey = 'HYPTEC HT';
        else if (modelKey === 'M8-PHEV') modelKey = 'M8 PHEV';`;

content = content.replace(oldLogic, newLogic);
fs.writeFileSync(filePath, content, 'utf-8');
console.log('Fixed duration logic');
