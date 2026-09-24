# Métricas Estructurales de Código

Este documento define el catálogo de métricas analíticas utilizadas por `architecture-structure-audit` para evaluar la salud arquitectónica de `rocapellino/pokedex`.

---

## 1. Volumen y Tamaño (LOC / SLOC)

- **Physical LOC (Lines of Code):** Total absoluto de líneas en el archivo.
- **Source LOC (SLOC):** Líneas ejecutables de código fuente excluyendo comentarios y líneas en blanco.
- **Comment Ratio:** Proporción de comentarios respecto al total de líneas. Una tasa excesivamente baja en lógica compleja o desmedidamente alta con código comentado sugiere degradación.
- **Distribución de Funciones:** Proporción de líneas por función (promedio y percentil 95).

### Umbrales Orientativos de Tamaño

| Tipo de Componente | Objetivo Típico | Umbral de Alerta (Warning) | Umbral Crítico (Revisión) |
| :--- | :---: | :---: | :---: |
| **Entrypoints / Servidores HTTP** | 100 - 300 LOC | > 400 LOC | > 600 LOC |
| **Rutas y Controladores** | 50 - 250 LOC | > 350 LOC | > 500 LOC |
| **Middlewares** | 30 - 150 LOC | > 200 LOC | > 300 LOC |
| **Servicios de Dominio / Negocio** | 100 - 350 LOC | > 450 LOC | > 700 LOC |
| **Capa de Persistencia / Repositorios** | 150 - 400 LOC | > 500 LOC | > 800 LOC |
| **Utilidades y Helpers** | 20 - 120 LOC | > 200 LOC | > 300 LOC |
| **Componentes de Frontend** | 80 - 300 LOC | > 450 LOC | > 650 LOC |

---

## 2. Métricas de Acoplamiento

El acoplamiento mide el grado de interdependencia entre módulos:

### A. Acoplamiento Aferente ($C_a$)

- **Definición:** Número de módulos externos que dependen de este módulo (responsabilidad hacia otros).
- **Interpretación:** Un $C_a$ alto indica que el módulo es central y ampliamente utilizado. Los cambios en él tienen alto impacto sistémico.

### B. Acoplamiento Eferente ($C_e$)

- **Definición:** Número de módulos externos de los que este módulo depende directamente (dependencias salientes).
- **Interpretación:** Un $C_e$ alto indica que el módulo es vulnerable a cambios en muchos otros componentes.

### C. Índice de Inestabilidad ($I$)

$$I = \frac{C_e}{C_a + C_e}$$

- **$I = 0$ (Completamente Estable):** Módulo con muchas dependencias entrantes y pocas salientes (ej. librerías núcleo, tipos base).
- **$I = 1$ (Completamente Inestable):** Módulo que depende de muchos otros componentes pero nadie depende de él (ej. controladores finales, scripts de arranque).

---

## 3. Métricas de Cohesión

La cohesión mide qué tan unidas están las responsabilidades internas de un módulo:

- **Falta de Cohesión en Métodos (LCOM):**
  Evalúa si las funciones o métodos del archivo operan sobre el mismo conjunto de variables, estado o modelos de datos.
  - **Alta cohesión:** Todas las funciones manipulan o transforman un tipo central compartido (ej. CRUD de Pokémon).
  - **Baja cohesión:** El archivo contiene funciones independientes que no comparten tipos, datos de entrada ni contexto (ej. un archivo que formatea fechas, hace hashing de contraseñas y parsea URLs).

---

## 4. Complejidad Ciclomática y Cognitiva

- **Complejidad Ciclomática ($v(G)$):** Cantidad de caminos de ejecución independientes a través del código (`if`, `while`, `for`, `switch/case`, operadores ternarios `? :`, cortocircuitos `&&`, `||`).
  - $1 - 10$: Lógica simple, bajo riesgo.
  - $11 - 20$: Lógica moderadamente compleja, requiere tests detallados.
  - $> 20$: Alto riesgo de defectos y dificultad para razonar.
- **Profundidad de Anidamiento (Max Nesting Depth):**
  - Nivel máximo de indentación o bloques anidados dentro de una función.
  - Una profundidad $> 4$ niveles dificulta el mantenimiento y suele encubrir falta de modularización o funciones de escape temprano (*early returns*).

---

## 5. Detección de Dependencias Circulares

Se analiza el grafo de importaciones en busca de ciclos $A \rightarrow B \rightarrow A$ o transitivos $A \rightarrow B \rightarrow C \rightarrow A$:

- **Impacto:** Dificultan la inicialización en tiempo de ejecución, generan estados `undefined` en imports ESM de Node.js, bloquean la separación en paquetes independientes e impiden el testeo aislado.

---

## 6. Duplicación de Código

- **Clones Tipo 1 (Exactos):** Bloques idénticos de código copiados entre archivos.
- **Clones Tipo 2 (Estructurales):** Bloques con lógica idéntica pero nombres de variables o identificadores cambiados.
- **Lógica duplicada de persistencia o validación:** Múltiples endpoints o capas realizando las mismas comprobaciones o transformaciones en lugar de invocar un validador o servicio unificado.

---

## 7. Métricas de Crecimiento Histórico y Churn

- **LOC Delta por Commit / Release:** Tasa de incremento porcentual entre versiones.
- **Tendencia:** Detección de patrones lineales o exponenciales (`280 → 350 → 430 → 520 → 700`).
- **Frecuencia de Modificación (Code Churn):** Número de veces que un archivo es modificado a lo largo de un período. Un archivo con alto churn y alta complejidad representa el mayor riesgo operativo del repositorio.

---

## 8. Matriz de Evaluación Compuesta

Para evitar falsos positivos basados únicamente en LOC, se aplica una matriz de decisión multicriterio:

| Señal 1: LOC | Señal 2: SRP | Señal 3: Acoplamiento ($C_e$) | Señal 4: Complejidad | Clasificación Resultante |
| :---: | :---: | :---: | :---: | :---: |
| > 600 | 1 responsabilidad | Bajo ($C_e < 5$) | Baja ($< 15$) | **INFO** (Archivo extenso pero cohesivo) |
| > 500 | 2 responsabilidades | Medio ($5 \le C_e \le 10$) | Moderada ($15 - 25$) | **WARNING** (Monitorear crecimiento) |
| > 400 | > 3 responsabilidades | Alto ($C_e > 12$) | Elevada ($> 20$) | **HIGH** (Degradación estructural / Monolito en gestación) |
| > 500 | > 4 responsabilidades | Alto ($C_e > 15$) | Muy Alta ($> 30$) | **CRITICAL** (God File confirmado / Refactor obligatorio) |
| Cualquier tamaño | Cruce de capas prohibido (ej. HTTP → SQL directo) | N/A | N/A | **HIGH** (Violación de límites arquitectónicos) |
