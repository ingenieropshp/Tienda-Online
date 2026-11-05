-- =====================================================================
-- DUVAN STORE · Migración 0003: catálogo de ejemplo con fotos reales
-- Categorías de la tienda: Camisetas, Pantalones, Pantalonetas, Sudaderas y Mochos (bermudas).
-- Las fotos son de Unsplash (licencia libre, uso comercial permitido).
-- Créditos completos en FOTOS-CREDITOS.md. Se reemplazan por las fotos
-- reales de Duvan desde el panel cuando estén listas.
-- =====================================================================

-- Quita los productos de ejemplo anteriores (ilustraciones), que aún no tienen pedidos.
DELETE FROM productos WHERE fotos LIKE '%/img/ejemplo/%';

-- Columnas: nombre, descripcion, categoria, precio, precio_anterior, colores (JSON), tallas con stock (JSON), fotos (JSON), destacado
INSERT INTO productos (nombre, descripcion, categoria, precio, precio_anterior, colores, tallas, fotos, destacado) VALUES
-- ---------------- Camisetas ----------------
('Camiseta Básica Negra', 'Camiseta de algodón peinado, cuello redondo y corte regular. El básico que combina con todo.', 'Camisetas', 39900, 49900,
 '[{"nombre":"Negro","hex":"#111111"}]', '{"S":6,"M":10,"L":8,"XL":4}',
 '["https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=900&q=80&auto=format&fit=crop","https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=900&q=80&auto=format&fit=crop"]', 1),
('Camiseta Básica Blanca', 'Camiseta blanca de algodón, suave y fresca para el clima de Urabá.', 'Camisetas', 39900, NULL,
 '[{"nombre":"Blanco","hex":"#F5F5F5"}]', '{"S":5,"M":8,"L":6,"XL":3}',
 '["https://images.unsplash.com/photo-1581655353564-df123a1eb820?w=900&q=80&auto=format&fit=crop"]', 1),
('Camiseta Verde Militar', 'Camiseta en algodón con lavado suave, tono verde militar.', 'Camisetas', 44900, 54900,
 '[{"nombre":"Verde","hex":"#4B5D3A"}]', '{"S":3,"M":5,"L":4,"XL":2}',
 '["https://images.unsplash.com/photo-1633966887768-64f9a867bdba?w=900&q=80&auto=format&fit=crop"]', 0),
('Camiseta Estampada', 'Camiseta blanca con estampado frontal, estilo urbano.', 'Camisetas', 49900, NULL,
 '[{"nombre":"Blanco","hex":"#F5F5F5"}]', '{"S":2,"M":4,"L":4,"XL":2}',
 '["https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?w=900&q=80&auto=format&fit=crop"]', 0),
-- ---------------- Pantalones ----------------
('Jean Clásico Azul', 'Jean de corte recto en denim resistente, lavado medio.', 'Pantalones', 119900, 139900,
 '[{"nombre":"Azul","hex":"#3B5B8C"}]', '{"28":2,"30":4,"32":5,"34":3,"36":2}',
 '["https://images.unsplash.com/photo-1714143136372-ddaf8b606da7?w=900&q=80&auto=format&fit=crop","https://images.unsplash.com/photo-1602293589930-45aad59ba3ab?w=900&q=80&auto=format&fit=crop"]', 1),
('Jean Tonos Denim', 'Jean slim con elasticidad, disponible en varios tonos de azul.', 'Pantalones', 129900, NULL,
 '[{"nombre":"Azul claro","hex":"#7FA1C9"},{"nombre":"Azul oscuro","hex":"#24395C"}]', '{"28":2,"30":3,"32":4,"34":2}',
 '["https://images.unsplash.com/photo-1542272604-787c3835535d?w=900&q=80&auto=format&fit=crop"]', 0),
('Pantalón Negro Urbano', 'Pantalón negro de corte moderno, cómodo para el día a día.', 'Pantalones', 99900, NULL,
 '[{"nombre":"Negro","hex":"#111111"}]', '{"28":0,"30":0,"32":0,"34":0}',
 '["https://images.unsplash.com/photo-1552902875-9ac1f9fe0c07?w=900&q=80&auto=format&fit=crop"]', 0),
-- ---------------- Pantalonetas ----------------
('Pantaloneta Playera Azul', 'Pantaloneta liviana de secado rápido, perfecta para playa y calor.', 'Pantalonetas', 54900, 69900,
 '[{"nombre":"Azul","hex":"#2E6DB4"}]', '{"S":3,"M":6,"L":5,"XL":2}',
 '["https://images.unsplash.com/photo-1617951907145-53f6eb87a3a3?w=900&q=80&auto=format&fit=crop"]', 1),
('Pantaloneta Verde', 'Pantaloneta en tela fresca con cordón ajustable.', 'Pantalonetas', 49900, NULL,
 '[{"nombre":"Verde","hex":"#4E7A4A"}]', '{"S":2,"M":4,"L":4,"XL":1}',
 '["https://images.unsplash.com/photo-1621496503717-095a410e1566?w=900&q=80&auto=format&fit=crop"]', 0),
-- ---------------- Sudaderas ----------------
('Sudadera Gris Jogger', 'Sudadera tipo jogger en algodón perchado, con puño y cordón.', 'Sudaderas', 89900, 109900,
 '[{"nombre":"Gris","hex":"#8E8E93"}]', '{"S":3,"M":5,"L":4,"XL":2}',
 '["https://images.unsplash.com/photo-1759229874786-6d0cc75d95be?w=900&q=80&auto=format&fit=crop"]', 1),
('Sudadera Oversize', 'Sudadera holgada y cómoda, ideal para descansar o salir.', 'Sudaderas', 94900, NULL,
 '[{"nombre":"Gris claro","hex":"#C7C7CC"}]', '{"S":2,"M":3,"L":3,"XL":2}',
 '["https://images.unsplash.com/photo-1779675789825-07feececf0f0?w=900&q=80&auto=format&fit=crop"]', 0),
-- ---------------- Mochos (bermudas) ----------------
('Mocho de Jean Azul', 'Bermuda de jean con bota recortada, fresca y resistente.', 'Mochos', 69900, 84900,
 '[{"nombre":"Azul","hex":"#4A6FA5"}]', '{"28":2,"30":4,"32":4,"34":2}',
 '["https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=900&q=80&auto=format&fit=crop"]', 1),
('Mocho Denim Oscuro', 'Bermuda en denim oscuro con bolsillos funcionales.', 'Mochos', 74900, NULL,
 '[{"nombre":"Azul oscuro","hex":"#24395C"}]', '{"28":1,"30":3,"32":3,"34":2,"36":1}',
 '["https://images.unsplash.com/photo-1779040623350-dfae823cc734?w=900&q=80&auto=format&fit=crop"]', 0);
