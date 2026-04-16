#!/bin/bash

# Setup script for Reservas WA Frontend
# Run this if you're having npm permission issues

echo "🔧 Reservas WA - Instalación"
echo "================================"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado. Descárgalo de https://nodejs.org"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo "✅ npm version: $(npm -v)"

# Clean previous installations
echo ""
echo "🧹 Limpiando instalaciones previas..."
rm -rf node_modules
rm -f package-lock.json

# Install dependencies
echo ""
echo "📦 Instalando dependencias..."
npm install --force --legacy-peer-deps

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ ¡Instalación completada!"
    echo ""
    echo "Próximos pasos:"
    echo "  npm run dev       # Iniciar servidor de desarrollo"
    echo "  npm run build     # Compilar para producción"
    echo "  npm start         # Iniciar servidor de producción"
else
    echo ""
    echo "❌ Error durante la instalación."
    echo ""
    echo "Soluciones posibles:"
    echo "1. Asegúrate de tener permisos de escritura en el directorio"
    echo "2. Intenta ejecutar como administrador (Windows) o con sudo (Linux/Mac)"
    echo "3. En WSL, ejecuta: chmod -R 755 $(pwd)"
    echo "4. En Windows en carpeta compartida: mueve el proyecto a una ruta nativa"
    exit 1
fi
