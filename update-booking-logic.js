const fs = require('fs');
const path = require('path');

const filePath = path.join('/Users/kanittamac/web/evservices/src/app/service-center/bookings/bay-booking/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

const helperFunctions = `
    // Helper to calculate custom duration
    const getCalculatedDuration = (stId, mileageValue) => {
        if (!carModel) return null;
        const cm = carModels.find(m => (m.Brand ? \`\${m.Brand} \${m.ModelName}\` : m.ModelName) === carModel);
        if (!cm) return null;
        
        let modelKey = cm.ModelCode;
        if (modelKey.startsWith('Y')) modelKey = 'Y PLUS';
        if (modelKey === 'YPLUS-TAXI') modelKey = 'Y PLUS TAXI';
        if (modelKey === 'ES-TAXI') modelKey = 'ES TAXI';
        if (modelKey === 'HT') modelKey = 'HYPTEC HT';
        if (modelKey === 'M8-PHEV') modelKey = 'M8 PHEV';
        
        const ratesForModel = CAR_MODEL_FLAT_RATES[modelKey];
        if (ratesForModel && mileageValue) {
            const hr = ratesForModel[mileageValue];
            if (hr) return hr * 60; // convert to minutes
        }
        return null;
    };
`;

const replace1Start = content.indexOf('// Auto-fill duration from Flat Rate');
const replace1End = content.indexOf('// Mileage options for the selected service type');
const replace1Original = content.substring(replace1Start, replace1End);

const replace1New = `// Auto-fill duration from Flat Rate
${helperFunctions}
    useEffect(() => {
        if (!selectedServiceType) { setDuration(0); return; }
        const stId = parseInt(selectedServiceType);

        if (selectedST?.RequiresMileage && selectedMileage) {
            const mileageId = parseInt(selectedMileage);
            const rate = flatRates.find(fr => fr.ServiceTypeID === stId && fr.MileageID === mileageId);
            
            // Override with CAR_MODEL_FLAT_RATES if applicable
            let finalDuration = rate ? rate.DurationMinutes : 0;
            if (rate && rate.Mileage) {
                const custom = getCalculatedDuration(stId, rate.Mileage.Value);
                if (custom) finalDuration = custom;
            }
            
            if (finalDuration > 0) { setDuration(finalDuration); setUseCustomDuration(false); }
            else { setDuration(0); }
        } else if (selectedST && !selectedST.RequiresMileage) {
            const rate = flatRates.find(fr => fr.ServiceTypeID === stId && fr.MileageID === null);
            if (rate) { setDuration(rate.DurationMinutes); setUseCustomDuration(false); }
            else { setDuration(120); setUseCustomDuration(false); }
        }
    }, [selectedServiceType, selectedMileage, flatRates, selectedST, carModel, carModels]);

    `;

content = content.replace(replace1Original, replace1New);

const replace2Start = content.indexOf('// Mileage options for the selected service type');
const replace2End = content.indexOf('// Vehicle search');
const replace2Original = content.substring(replace2Start, replace2End);

const replace2New = `// Mileage options for the selected service type
    const relevantMileages = selectedST?.RequiresMileage
        ? flatRates
            .filter(fr => fr.ServiceTypeID === parseInt(selectedServiceType) && fr.Mileage)
            .map(fr => {
                let duration = fr.DurationMinutes;
                const custom = getCalculatedDuration(parseInt(selectedServiceType), fr.Mileage.Value);
                if (custom) duration = custom;
                return {
                    value: fr.MileageID!.toString(),
                    label: fr.Mileage!.Label,
                    duration: duration,
                };
            })
        : [];

    `;

content = content.replace(replace2Original, replace2New);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Logic updated');
