-- =====================================================================
-- DUVAN STORE · Migración 0002: productos de ejemplo
-- Sirven para ver la tienda funcionando. Se pueden editar o borrar
-- desde el panel cuando lleguen las fotos y precios reales.
-- =====================================================================

-- Cada INSERT crea un producto. Columnas:
-- nombre, descripcion, categoria, precio, precio_anterior, colores (JSON), tallas con stock (JSON), fotos (JSON), destacado
INSERT INTO productos (nombre, descripcion, categoria, precio, precio_anterior, colores, tallas, fotos, destacado) VALUES
-- Camisa con descuento, dos colores
('Camisa Oxford', 'Camisa manga larga en algodón Oxford, corte regular. Ideal para oficina o salida.', 'Camisas', 89900, 119900,
 '[{"nombre":"Blanco","hex":"#FFFFFF"},{"nombre":"Azul","hex":"#3B5B92"}]',
 '{"S":4,"M":6,"L":5,"XL":2}',
 '["/img/ejemplo/camisa-oxford-blanca.svg","/img/ejemplo/camisa-oxford-azul.svg"]', 1),
-- Camisa de lino sin descuento
('Camisa de Lino', 'Camisa fresca de lino para clima cálido, cuello camisero.', 'Camisas', 99900, NULL,
 '[{"nombre":"Beige","hex":"#D8C3A5"}]',
 '{"S":2,"M":3,"L":3}',
 '["/img/ejemplo/camisa-lino-beige.svg"]', 0),
-- Camiseta básica, más vendida
('Camiseta Básica', 'Camiseta de algodón peinado, cuello redondo. Un básico que combina con todo.', 'Camisas', 39900, 49900,
 '[{"nombre":"Negro","hex":"#111111"}]',
 '{"XS":5,"S":8,"M":10,"L":8,"XL":4}',
 '["/img/ejemplo/camiseta-basica-negra.svg"]', 1),
-- Jean
('Jean Slim Azul', 'Jean slim fit con elasticidad, lavado medio.', 'Pantalones', 129900, NULL,
 '[{"nombre":"Azul","hex":"#2F4A6D"}]',
 '{"S":3,"M":5,"L":4,"XL":2}',
 '["/img/ejemplo/pantalon-jean-azul.svg"]', 1),
-- Jogger con descuento
('Jogger Urbano', 'Jogger en french terry con puño en tobillo y bolsillos laterales.', 'Pantalones', 69900, 89900,
 '[{"nombre":"Negro","hex":"#222222"}]',
 '{"S":4,"M":4,"L":3}',
 '["/img/ejemplo/pantalon-jogger-negro.svg"]', 0),
-- Cargo AGOTADO (todas las tallas en 0) para ver la etiqueta "Agotado"
('Pantalón Cargo', 'Pantalón cargo en dril con bolsillos laterales.', 'Pantalones', 109900, NULL,
 '[{"nombre":"Verde oliva","hex":"#5B6B3A"}]',
 '{"S":0,"M":0,"L":0}',
 '["/img/ejemplo/pantalon-cargo-verde.svg"]', 0),
-- Vestidos
('Vestido Midi Negro', 'Vestido midi con tiras, tela fluida. Elegante para cualquier ocasión.', 'Vestidos', 119900, 149900,
 '[{"nombre":"Negro","hex":"#1A1A1A"}]',
 '{"XS":2,"S":3,"M":3,"L":1}',
 '["/img/ejemplo/vestido-midi-negro.svg"]', 1),
('Vestido Floral', 'Vestido corto estampado floral, ideal para el calor de Urabá.', 'Vestidos', 94900, NULL,
 '[{"nombre":"Rojo","hex":"#B23A48"}]',
 '{"S":3,"M":4,"L":2}',
 '["/img/ejemplo/vestido-floral-rojo.svg"]', 0),
-- Zapatos (tallas numéricas)
('Tenis Blancos', 'Tenis urbanos en cuero sintético, suela antideslizante.', 'Zapatos', 159900, 189900,
 '[{"nombre":"Blanco","hex":"#FAFAFA"}]',
 '{"37":2,"38":3,"39":3,"40":4,"41":3,"42":2}',
 '["/img/ejemplo/tenis-blancos.svg"]', 1),
('Botas Café', 'Botas de caña media con cordones, cómodas para todo el día.', 'Zapatos', 199900, NULL,
 '[{"nombre":"Café","hex":"#6B4226"}]',
 '{"39":1,"40":2,"41":2,"42":1}',
 '["/img/ejemplo/botas-cafe.svg"]', 0),
-- Accesorios (talla única)
('Gorra Negra', 'Gorra ajustable con logo bordado.', 'Accesorios', 34900, 44900,
 '[{"nombre":"Negro","hex":"#151515"}]',
 '{"Única":10}',
 '["/img/ejemplo/gorra-negra.svg"]', 0),
('Bolso de Mano', 'Bolso en cuero sintético con correa ajustable.', 'Accesorios', 79900, NULL,
 '[{"nombre":"Café","hex":"#8B5A2B"}]',
 '{"Única":4}',
 '["/img/ejemplo/bolso-cafe.svg"]', 0),
-- Chaqueta
('Chaqueta Denim', 'Chaqueta de jean clásica con botones metálicos.', 'Chaquetas', 149900, 179900,
 '[{"nombre":"Azul","hex":"#4A6FA5"}]',
 '{"S":2,"M":3,"L":2,"XL":1}',
 '["/img/ejemplo/chaqueta-denim.svg"]', 1);
