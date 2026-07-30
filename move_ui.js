const fs = require('fs');
const path = require('path');

const filePath = path.join('/Users/kanittamac/web/evservices/src/app/service-center/bookings/bay-booking/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Update currentStep calculation
content = content.replace(
    /const currentStep = !selectedServiceType \? 1[\s\S]*?: 3;/g,
    `const currentStep = !carModel ? 1\n        : !selectedServiceType ? 2\n        : selectedST?.RequiresMileage && !selectedMileage ? 3\n        : effectiveDuration <= 0 ? 3\n        : 4;`
);

// 2. Extract Customer Info block
const step3Start = content.indexOf('{/* ========== STEP 3: ข้อมูลลูกค้า ========== */}');
let step3End = content.indexOf('{/* Error */}');
if (step3Start > -1 && step3End > -1) {
    let customerInfoBlock = content.substring(step3Start, step3End);
    // Remove {effectiveDuration > 0 && ( and )}
    customerInfoBlock = customerInfoBlock.replace(/{effectiveDuration > 0 && \(\s*<Card/g, '<Card');
    customerInfoBlock = customerInfoBlock.replace(/<\/Card>\s*\)\}\s*$/g, '</Card>\n\n                    ');

    // Change step number to 1
    customerInfoBlock = customerInfoBlock.replace(
        /<span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">[\s\S]*?<\/span>/g,
        '<span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">1</span>'
    );
    // Change STEP 3 to STEP 1 in comment
    customerInfoBlock = customerInfoBlock.replace('STEP 3: ข้อมูลลูกค้า', 'STEP 1: ข้อมูลลูกค้าและรถยนต์');

    // Add opacity logic based on currentStep
    customerInfoBlock = customerInfoBlock.replace('<Card>', '<Card className={currentStep >= 1 ? \'\' : \'opacity-50\'}>');

    // Remove the block from original location
    content = content.substring(0, step3Start) + content.substring(step3End);

    // 3. Find Step 1: ประเภทบริการ and insert before it
    const step1Start = content.indexOf('{/* ========== STEP 1: ประเภทบริการ ========== */}');
    
    // Also update Step 1 -> Step 2
    content = content.replace('STEP 1: ประเภทบริการ', 'STEP 2: ประเภทบริการ');
    content = content.replace('<span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">1</span>', '<span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">2</span>');
    content = content.replace(/<Card className=\{currentStep >= 1 \? '' : 'opacity-50'\}>/g, '<Card className={currentStep >= 2 ? \'\' : \'opacity-50\'}>');

    // Update Step 2 -> Step 3
    content = content.replace('STEP 2: ระยะทาง', 'STEP 3: ระยะทาง');
    content = content.replace('<span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">2</span>', '<span className="bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm">3</span>');
    content = content.replace(/<Card className=\{currentStep >= 2 \? '' : 'opacity-50'\}>/g, '<Card className={currentStep >= 3 ? \'\' : \'opacity-50\'}>');

    // Insert customerInfoBlock
    content = content.substring(0, step1Start) + customerInfoBlock + '\n                    ' + content.substring(step1Start);

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('UI Reordered Successfully!');
} else {
    console.error('Could not find markers');
}
