-- MoviBici · respaldo manual de la base de datos (agosto 2026)
-- Generado por: soporte@movibici.cl  |  Motivo: migración de servidor
INSERT INTO usuarios (id,nombre,email,rut,rol,tipo,saldo,password_hash) VALUES (1,'Administrador MoviBici','admin@movibici.cl','10111222-5','admin','premium',0,'0192023a7bbd73250516f069df18b500');
INSERT INTO usuarios (id,nombre,email,rut,rol,tipo,saldo,password_hash) VALUES (2,'Soporte MoviBici','soporte@movibici.cl','10222333-0','soporte','regular',0,'(omitido)');
-- Tabla cupones
INSERT INTO cupones (codigo,descuento_pct,vence,usos_max) VALUES ('VERANO10',10,'2026-12-31',500);
INSERT INTO cupones (codigo,descuento_pct,vence,usos_max) VALUES ('STAFF50',50,'2099-12-31',10);
