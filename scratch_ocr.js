const Tesseract = require('tesseract.js');
const path = require('path');

const img1 = 'c:/xampp/htdocs/ex/img/slip/Screenshot_20260623_205238_Photos & videos.png';
const img2 = 'c:/xampp/htdocs/ex/img/slip/Screenshot_20260623_205247_LINE.png';

async function runOCR(imagePath, name) {
  console.log(`=== Scanning ${name} ===`);
  try {
    const result = await Tesseract.recognize(imagePath, 'tha+eng');
    console.log('--- Raw Output ---');
    console.log(result.data.text);
    console.log('------------------\n');
  } catch (err) {
    console.error(`Error scanning ${name}:`, err);
  }
}

async function main() {
  await runOCR(img1, 'Slip 1 (Photos & videos)');
  await runOCR(img2, 'Slip 2 (LINE)');
  process.exit(0);
}

main();
