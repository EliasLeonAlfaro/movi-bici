# MoviBici · Especificación funcional (v0.9.0-rc1)

Documento de referencia para el diseño de casos de prueba. **El comportamiento esperado del sistema es el que describe este documento**, no el que se observa al usarlo: cuando el sistema se comporta distinto a lo aquí especificado, es un hallazgo.

## 1. Alcance del producto

MoviBici es una plataforma de bicicletas compartidas. El usuario se registra, recarga saldo, reserva una bicicleta en una estación, la desbloquea con un código, la usa y la devuelve en cualquier estación; el costo se descuenta de su saldo.

| Componente | Descripción |
|---|---|
| Frontend | Aplicación web de una página, servida en `http://localhost:4000` |
| API REST | `http://localhost:4000/api` · definición en `/docs` y `/api/openapi.json` |
| Base de datos | SQLite embebida en el contenedor |

## 2. Roles y tipos de cuenta

| Rol | Permisos |
|---|---|
| `usuario` | Reservar, viajar, recargar saldo, editar su nombre y teléfono, publicar reseñas. |
| `soporte` | Igual que `usuario`. |
| `admin` | Todo lo anterior, más: ver el listado de usuarios, bloquear/activar cuentas y ver indicadores. |

| Tipo de cuenta | Descuento por tipo |
|---|---|
| `regular` | 0 % |
| `estudiante` | 20 % |
| `premium` | 30 % |

## 3. Reglas de negocio

### RN-01 · Registro
- Campos obligatorios: nombre, correo, RUT, contraseña.
- El correo debe tener formato válido y ser **único sin distinguir mayúsculas de minúsculas**.
- La contraseña debe tener **al menos 8 caracteres, una mayúscula y un número**.
- El RUT debe tener formato `12345678-5` y un **dígito verificador correcto** (módulo 11).
- La cuenta nueva es `regular`, rol `usuario`, con saldo $0.

### RN-02 · Recarga de saldo
- Monto entero, **mínimo $1.000 y máximo $100.000 por operación**.
- La recarga se refleja de inmediato en el saldo y en el historial de movimientos.

### RN-03 · Tarifa del viaje
1. Cargo de desbloqueo: **$300** por viaje.
2. Tarifa por minuto según el tipo de bicicleta: clásica **$60**, eléctrica **$120**, de carga **$150**.
3. Los minutos se **redondean hacia arriba** (mínimo 1 minuto).
4. Los primeros **60 minutos** se cobran a tarifa normal. **Sobre 60 minutos** (es decir, desde el minuto 61), cada minuto adicional se cobra al **doble**.
5. **Descuentos no acumulables:** se aplica un único descuento, el **mayor** entre el descuento por tipo de cuenta y el del cupón.
6. Cupón `PRIMERVIAJE`: viaje **gratis hasta 30 minutos**, solo para usuarios **sin viajes finalizados**. Si el viaje excede 30 minutos, el cupón no aplica.
7. El costo se redondea al peso entero más cercano y **no puede superar $15.000 por viaje**.

### RN-04 · Máquina de estados del viaje

```
            reservar            iniciar (código correcto)         finalizar
 (ninguno) ─────────► RESERVADO ────────────────────────► EN_CURSO ──────────► FINALIZADO
                          │  cancelar / expira (10 min)
                          ▼
                      CANCELADO
```
- Un usuario puede tener **un solo viaje activo** (reservado o en curso).
- **Reservar** exige: cuenta activa, **saldo mínimo de $2.000 (inclusive)**, bicicleta `disponible` y, si es eléctrica, **batería ≥ 20 %**.
- La reserva **expira a los 10 minutos**: si el usuario intenta iniciarla después, el viaje pasa a `cancelado` y la bicicleta vuelve a `disponible`.
- **Iniciar** exige el código de desbloqueo de 4 dígitos entregado al reservar.
- Solo un viaje `reservado` puede cancelarse (sin costo). **Un viaje en curso no se cancela: se finaliza.**
- Solo un viaje `en_curso` puede finalizarse, y **una sola vez**. `finalizado` y `cancelado` son estados terminales.
- **Finalizar** exige una estación de destino con **anclajes libres** (ocupados < capacidad).
- Si al finalizar el saldo resulta insuficiente, el viaje se finaliza igualmente y la cuenta queda `bloqueada` hasta que el usuario regularice su saldo.

### RN-05 · Cupones
| Cupón | Descuento | Condiciones |
|---|---|---|
| `VERANO10` | 10 % | Vigente **hasta su fecha de vencimiento, inclusive**. |
| `PRIMERVIAJE` | 100 % hasta 30 min | Ver RN-03.6. Un solo uso por usuario. |
| `UNIVERSIDAD15` | 15 % | Solo cuentas `estudiante`. Máximo 100 usos en total. |

- Un cupón (excepto los que digan otra cosa) puede usarse **una sola vez por usuario**.
- Un cupón vencido, agotado o no aplicable al tipo de cuenta se rechaza con un mensaje claro y **no altera el cobro**.

### RN-06 · Búsqueda y filtros de bicicletas
Los filtros (`tipo`, `estación`, `batería mínima`, `solo disponibles`) y la búsqueda por texto se **combinan con AND**: el resultado debe cumplir **todos** los criterios aplicados.

### RN-07 · Reseñas
- Texto de 1 a 280 caracteres; puntaje entero de **1 a 5**.
- Solo pueden reseñar usuarios autenticados. El texto se muestra siempre como **texto plano**.

### RN-08 · Perfil
- El usuario puede modificar **únicamente su nombre y su teléfono**. Rol, tipo de cuenta, saldo y estado **no son editables por el usuario**.
- Un usuario solo puede ver el detalle de **sus propios** viajes y datos personales.

### RN-09 · Seguridad de la cuenta
- Las contraseñas se almacenan con un algoritmo de hash seguro con sal.
- La sesión expira a los **30 minutos**.
- Tras **5 intentos fallidos** de inicio de sesión, la cuenta se bloquea 15 minutos.
- Los mensajes de error de autenticación no deben revelar si un correo existe.
- Los errores internos no deben exponer detalles técnicos al usuario.
- Las rutas de administración solo son accesibles para el rol `admin`.

## 4. Requisitos no funcionales de referencia

| Atributo (ISO/IEC 25010) | Criterio de aceptación |
|---|---|
| Adecuación funcional | El sistema cumple las reglas RN-01 a RN-08. |
| Seguridad | Cumple RN-09 y no presenta vulnerabilidades de severidad Crítica o Alta (OWASP Top 10). |
| Fiabilidad | Un cobro se realiza **exactamente una vez** por viaje. |
| Mantenibilidad | Sin *bugs* ni *code smells* bloqueantes según SonarQube. |

## 5. Fuera de alcance de las pruebas

- Los endpoints bajo `/api/lab/*` (instrumentos de laboratorio: reloj simulado y restablecimiento de datos).
- Rendimiento y pruebas de carga.
- Ataques contra cualquier sistema distinto del contenedor local.
