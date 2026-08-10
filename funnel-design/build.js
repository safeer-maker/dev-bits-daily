import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');

console.log('🚀 Building production distribution bundle in dist/...');

// Ensure dist directory exists
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Read source files
const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
const ghPagesContent = fs.readFileSync(path.join(__dirname, 'gh-pages.html'), 'utf-8');
const cssContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8');
const jsContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');

// Copy/Write production bundle to dist
fs.writeFileSync(path.join(distDir, 'index.html'), htmlContent);
fs.writeFileSync(path.join(distDir, 'gh-pages.html'), ghPagesContent);
fs.writeFileSync(path.join(distDir, 'styles.css'), cssContent);
fs.writeFileSync(path.join(distDir, 'app.js'), jsContent);

console.log('✅ Production build successful! Compiled files written to dist/:');
console.log('   - dist/index.html    (Dark Glassmorphism Funnel)');
console.log('   - dist/gh-pages.html (Light Emerald & Gold GitHub Pages Theme)');
console.log('   - dist/styles.css');
console.log('   - dist/app.js');
