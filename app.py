import sys
import os

# Asegurar que el directorio src está en sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from src.app import app

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
