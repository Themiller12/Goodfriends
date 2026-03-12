/**
 * Script de test pour lancer l'app sans Metro
 * Usage: node test-without-metro.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Lancement de l\'application sans Metro...');

// Option 1: Webpack Dev Server
function startWithWebpack() {
  console.log('📦 Démarrage avec Webpack...');
  const webpack = spawn('npm', ['run', 'start:webpack'], {
    stdio: 'inherit',
    shell: true,
    cwd: __dirname
  });

  webpack.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ Erreur Webpack: ${code}`);
    }
  });

  return webpack;
}

// Option 2: Vite Dev Server
function startWithVite() {
  console.log('⚡ Démarrage avec Vite...');
  const vite = spawn('npm', ['run', 'start:vite'], {
    stdio: 'inherit',
    shell: true,
    cwd: __dirname
  });

  vite.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ Erreur Vite: ${code}`);
    }
  });

  return vite;
}

// Choix du bundler
const bundler = process.argv[2] || 'webpack';

if (bundler === 'vite') {
  startWithVite();
} else {
  startWithWebpack();
}

console.log(`
✅ Application démarrée sans Metro!
🌐 Ouvrez http://localhost:3000 dans votre navigateur
🔧 Bundler utilisé: ${bundler}

Pour changer de bundler:
- node test-without-metro.js webpack
- node test-without-metro.js vite
`);