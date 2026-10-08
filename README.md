# MoviBici · Sistema bajo prueba (SUT)

Plataforma de bicicletas compartidas urbanas, **construida con defectos funcionales y de seguridad deliberados** para la actividad integradora de ISY1102 (EA2).

> ⚠️ **Uso exclusivo en laboratorio.** Esta aplicación es vulnerable por diseño. Ejecútala solo en tu equipo (el contenedor publica el puerto únicamente en `127.0.0.1`). **Nunca** la expongas a una red ni la despliegues en un servidor público, y **nunca** apliques las técnicas de la actividad contra sistemas que no sean este contenedor.

## 1. Requisitos

- Docker Desktop (o Docker Engine + Compose v2).
- Un navegador y, para la parte de análisis: SonarQube y OWASP ZAP (los mismos de las actividades 2.3 y 2.1.4).

## 2. Levantar el entorno

```bash
docker compose up -d --build
```

Verifica que el contenedor `movibici` figure como *healthy*:

```bash
docker ps --filter name=movibici
curl http://localhost:4000/api/salud
```

| Recurso | URL |
|---|---|
| Aplicación (frontend) | http://localhost:4000 |
| API REST | http://localhost:4000/api |
| Documentación de la API | http://localhost:4000/docs |
| Definición OpenAPI (para Postman / ZAP) | http://localhost:4000/api/openapi.json |

Para detener y borrar el contenedor: `docker compose down` (agrega `-v` para borrar también los datos).

### Alternativa sin Docker (Node.js ≥ 24)

```bash
npm install
LAB_MODE=1 npm start        # PowerShell: $env:LAB_MODE=1; npm start
```

## 3. Cuentas de prueba

| Perfil | Correo | Contraseña | Tipo | Saldo inicial |
|---|---|---|---|---|
| Usuario regular | `carlos.regular@movibici.cl` | `Regular2026` | regular | $20.000 |
| Estudiante | `ana.estudiante@movibici.cl` | `Estudiante2026` | estudiante | $15.000 |
| Premium | `patricia.premium@movibici.cl` | `Premium2026` | premium | $30.000 |
| Saldo límite 1 | `borde1999@movibici.cl` | `Borde2026` | regular | $1.999 |
| Saldo límite 2 | `borde2000@movibici.cl` | `Borde2026` | regular | $2.000 |
| Sin viajes previos | `nuevo.sinviajes@movibici.cl` | `Nuevo2026` | regular | $10.000 |

Carlos, Ana y Patricia tienen viajes históricos. Las demás cuentas del sistema **no se entregan**: forma parte del trabajo determinar qué otras cuentas existen y qué tan protegidas están.

## 4. Datos de apoyo para las pruebas

- **Bicicletas con batería en el límite:** `MB-E19` (19 %), `MB-E20` (20 %), `MB-E21` (21 %).
- **Estación llena:** *Plaza de Maipú* (capacidad 4, con 4 bicicletas).
- **Cupones:** `VERANO10`, `PRIMERVIAJE`, `UNIVERSIDAD15`, `CADUCADO20`.
- **Fecha de vencimiento:** `VERANO10` vence el día en que se restablecen los datos.

## 5. Instrumentos de laboratorio

Para poder probar reglas basadas en tiempo (30 min, 60 min, expiración de reserva, sesión) sin esperar, el entorno incluye un **reloj simulado**. Estos endpoints **no forman parte del producto** y están fuera del alcance de las pruebas.

| Acción | Comando |
|---|---|
| Congelar el reloj | `curl -X POST localhost:4000/api/lab/reloj -H "Content-Type: application/json" -d '{"congelar":true}'` |
| Avanzar 30 minutos | `curl -X POST localhost:4000/api/lab/reloj -H "Content-Type: application/json" -d '{"minutos":30}'` |
| Reanudar el reloj | `curl -X POST localhost:4000/api/lab/reloj -H "Content-Type: application/json" -d '{"congelar":false}'` |
| Ver la hora del sistema | `curl localhost:4000/api/lab/reloj` |
| **Restablecer todos los datos** | `curl -X POST localhost:4000/api/lab/reset` |

> **Buena práctica:** congela el reloj antes de reservar, avanza los minutos que necesites y finaliza. Así la duración del viaje es exacta (con el reloj corriendo, unos segundos reales pueden empujar un viaje de 60 min a 61).
> Restablece los datos antes de cada ciclo de ejecución para que las pruebas sean repetibles.

## 6. Código fuente (para el análisis estático)

```
MoviBici/
├── src/                 API (Node.js + Express) y acceso a datos (SQLite)
│   ├── routes/          auth, catalogo, viajes, cuenta, sistema
│   ├── tarifas.js       cálculo de la tarifa (RN-03)
│   └── ...
├── public/              Frontend (HTML + JS + CSS)
├── docs/                Especificación funcional
├── Dockerfile · docker-compose.yml · .env
```

Para SonarQube, analiza la carpeta raíz del proyecto (`sonar.sources=src,public`, `sonar.exclusions=node_modules/**`).

## 7. Documentos

- [`docs/ESPECIFICACION_FUNCIONAL.md`](docs/ESPECIFICACION_FUNCIONAL.md): reglas de negocio (RN-01 a RN-09) y criterios de aceptación. **Es la fuente de verdad para decidir si un resultado es correcto o es un defecto.**
