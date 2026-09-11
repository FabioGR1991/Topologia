```markdown
# Resumen de Traspaso y Hoja de Ruta: Topología Empresarial

---

## 1. Estado Actual y Arquitectura

* **Propósito del Proyecto:** Plataforma interactiva de organigrama y topología organizacional que permite mapear la estructura jerárquica, departamentos, liderazgos, funciones y permisos del personal mediante una interfaz visual con diagramas interactivos.
* **Stack Tecnológico:**
  * **Frontend:** React + Vite, Tailwind CSS, React Flow (gestión de nodos, conexiones y drag-and-drop).
  * **Backend:** Node.js con Express.js.
  * **Base de Datos:** SQLite (`organigrama.db`).
* **Estructura de Directorios:**
  * `TOPOLOGIA EMPRESARIAL/`
    * `organigrama-app/` (Cliente Vite/React)
    * `organigrama-backend/` (Servidor Node/Express + SQLite)
* **Estado de Avance:**
  * Renderizado dinámico de nodos individuales (`UserNode`) y de departamento/área (`DepartmentNode`) agrupados por miembros.
  * Gestión de marcas de agua dinámicas (logo corporativo con `object-cover` y opacidad en tarjetas).
  * Conexiones/relaciones jerárquicas editables con drag-and-drop y eliminación de dependencias con clic en bordes (`edges`).
  * Persistencia de posiciones de nodos y datos de usuarios en base de datos local SQLite.
  * Panel lateral desplegable (*glassmorphic drawer*) con detalles de usuario, copia rápida de email y acciones CRUD.
  * Modales para la creación y edición de miembros del personal.

---

## 2. Capa 1: UI y Frontend para Stitch (Maquetado y UI)

Componentes, maquetas y pantallas prioritarias a diseñar visualmente en Stitch antes de su implementación en código:

1. **Dashboard Principal y Navbar Global:**
   * Barra superior con controles de filtrado rápido por departamento, buscador global de personal y selector de vista (Jerárquica vs. Matricial).
2. **Rediseño del Modal Formulario (CRUD de Usuarios):**
   * Vista de formulario por pasos (Datos Personales → Puesto/Área → Funciones/Permisos).
   * Selector visual de superiores directos en lugar de un `<select>` estándar.
3. **Módulo de Estadísticas y Analítica de Carga Organizacional:**
   * Pantalla/Widget para visualizar la cantidad de personal por área, distribución de roles y métricas de permisos asignados.
4. **Estados de Carga y Errores (Skeletons & Empty States):**
   * Maquetado de estados de carga vacíos (*Empty States*) cuando no hay áreas o usuarios registrados, y *Skeletons* animados mientras se procesan las peticiones al backend.

---

## 3. Capa 2: Lógica Central y Reglas para Gemini (Backend, Arquitectura y Chat)

Endpoints, modelos de datos y lógica de negocio para definir y refinar de forma continua:

1. **Optimización del Modelo de Datos (SQLite):**
   * Evolución del esquema para soportar proyectos asignados, múltiples superiores (Estructura Matricial) y niveles jerárquicos explícitos (`level_id`).
   * Normalización de las tablas de `functions` y `permissions` (actualmente tratadas como arrays/strings planos).
2. **Endpoints Backend Pendientes:**
   * `GET /api/departments`: Endpoint para gestionar áreas como entidades independientes, no solo agrupadas por nombre.
   * `POST /api/departments`: Creación y edición de metadatos de departamentos (color, descripción, líder asignado).
   * `POST /api/users/batch-positions`: Guardado masivo y transaccional de posiciones cuando se mueven departamentos enteros.
3. **Exportación e Importación de Datos:**
   * Lógica para exportar la estructura organizacional a formatos JSON / CSV / PDF.
   * Importación masiva de personal desde archivos `.csv` o `.xlsx`.

---

## 4. Capa 3: Tareas de Automatización para Antigravity (Agentes, Ejecución y CI/CD)

Flujos de trabajo, scripts e instrucciones a delegar a agentes autónomos de Antigravity:

1. **Pruebas End-to-End (E2E) e Integración:**
   * Verificación autónoma de la API REST (`/api/users`, `/api/users/positions`) ante cambios de esquema en SQLite.
   * Tests de interacción UI: Simulación de arrastre de nodos, reordenamiento de jerarquías y apertura del panel de detalles.
2. **Scripts de Healthcheck y Auto-start Local:**
   * Agente de orquestación para verificar disponibilidad de puertos (3001 para el backend y 5173 para el frontend) y levantar ambos entornos automáticamente de forma coordinada.
3. **Pipeline de Integración y Despliegue Continuo (CI/CD):**
   * Verificación de sintaxis (`eslint`), compilación del proyecto (`npm run build`) y migración automática de la base de datos `organigrama.db`.
   * Empaquetado y containerización (Docker) para despliegue de entornos de testing o producción local.

```