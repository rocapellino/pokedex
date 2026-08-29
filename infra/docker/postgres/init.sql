-- ==============================================================================
-- Schema Initialization: Pokédex Database (PostgreSQL 16)
-- Basado en el modelo de datos de WikiDex (Generaciones I a IX)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS generations (
    id SERIAL PRIMARY KEY,
    roman_name VARCHAR(10) NOT NULL UNIQUE,
    region_name VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE,
    color_hex VARCHAR(10) NOT NULL,
    icon_url VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS abilities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS pokemons (
    id SERIAL PRIMARY KEY,
    national_number INT NOT NULL UNIQUE,
    name_es VARCHAR(80) NOT NULL,
    name_en VARCHAR(80),
    height_m NUMERIC(5, 2) NOT NULL DEFAULT 0.0,
    weight_kg NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    habitat VARCHAR(50) DEFAULT 'Desconocido',
    generation_id INT REFERENCES generations(id) ON DELETE SET NULL,
    image_url VARCHAR(500) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pokemon_types (
    pokemon_id INT NOT NULL REFERENCES pokemons(id) ON DELETE CASCADE,
    type_id INT NOT NULL REFERENCES types(id) ON DELETE CASCADE,
    slot INT NOT NULL DEFAULT 1,
    PRIMARY KEY (pokemon_id, type_id)
);

CREATE TABLE IF NOT EXISTS pokemon_abilities (
    pokemon_id INT NOT NULL REFERENCES pokemons(id) ON DELETE CASCADE,
    ability_id INT NOT NULL REFERENCES abilities(id) ON DELETE CASCADE,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    slot INT NOT NULL DEFAULT 1,
    PRIMARY KEY (pokemon_id, ability_id)
);

CREATE TABLE IF NOT EXISTS pokemon_stats (
    pokemon_id INT PRIMARY KEY REFERENCES pokemons(id) ON DELETE CASCADE,
    hp INT NOT NULL DEFAULT 0,
    attack INT NOT NULL DEFAULT 0,
    defense INT NOT NULL DEFAULT 0,
    sp_attack INT NOT NULL DEFAULT 0,
    sp_defense INT NOT NULL DEFAULT 0,
    speed INT NOT NULL DEFAULT 0,
    bst INT GENERATED ALWAYS AS (hp + attack + defense + sp_attack + sp_defense + speed) STORED
);

CREATE TABLE IF NOT EXISTS evolutions (
    id SERIAL PRIMARY KEY,
    pre_evolution_id INT REFERENCES pokemons(id) ON DELETE CASCADE,
    post_evolution_id INT REFERENCES pokemons(id) ON DELETE CASCADE,
    trigger_type VARCHAR(50) NOT NULL DEFAULT 'Nivel',
    min_level INT,
    item_name VARCHAR(80)
);

-- ==============================================================================
-- Índices para optimización de consultas y filtros
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_pokemons_national_number ON pokemons(national_number);
CREATE INDEX IF NOT EXISTS idx_pokemons_name_es ON pokemons(name_es);
CREATE INDEX IF NOT EXISTS idx_pokemons_generation ON pokemons(generation_id);
CREATE INDEX IF NOT EXISTS idx_pokemon_stats_bst ON pokemon_stats(bst);

-- ==============================================================================
-- Seed Data: Generaciones, Tipos, Habilidades y Pokémon Actualizados (WikiDex)
-- ==============================================================================
INSERT INTO generations (id, roman_name, region_name) VALUES
(1, 'Gen I', 'Kanto'),
(2, 'Gen II', 'Johto'),
(3, 'Gen III', 'Hoenn'),
(4, 'Gen IV', 'Sinnoh'),
(5, 'Gen V', 'Teselia'),
(6, 'Gen VI', 'Kalos'),
(7, 'Gen VII', 'Alola'),
(8, 'Gen VIII', 'Galar'),
(9, 'Gen IX', 'Paldea')
ON CONFLICT (id) DO NOTHING;

INSERT INTO types (name, color_hex) VALUES
('Eléctrico', '#FACC15'),
('Fuego', '#EF4444'),
('Agua', '#3B82F6'),
('Planta', '#10B981'),
('Psíquico', '#EC4899'),
('Roca', '#B45309'),
('Tierra', '#D97706'),
('Hielo', '#06B6D4'),
('Fantasma', '#8B5CF6'),
('Dragón', '#6366F1'),
('Normal', '#6B7280'),
('Lucha', '#DC2626'),
('Veneno', '#A855F7'),
('Bicho', '#84CC16'),
('Volador', '#38BDF8'),
('Acero', '#94A3B8'),
('Siniestro', '#334155'),
('Hada', '#F472B6')
ON CONFLICT (name) DO NOTHING;

INSERT INTO abilities (name, description) VALUES
('Electricidad estática', 'Puede paralizar al contacto físico.'),
('Pararrayos', 'Atrae ataques de tipo eléctrico y aumenta el ataque especial.'),
('Mar llamas', 'Potencia los ataques de tipo fuego en situaciones de peligro.'),
('Espesura', 'Potencia los ataques de tipo planta en situaciones de peligro.'),
('Torrente', 'Potencia los ataques de tipo agua en situaciones de peligro.'),
('Cuerpo maldito', 'Puede anular el movimiento del atacante tras recibir daño.'),
('Impasible', 'Aumenta la velocidad tras retroceder.'),
('Mutatipo', 'Cambia el tipo del usuario al del movimiento que va a usar.'),
('Lanza paleo', 'Potencia la estadística más alta bajo sol o con energía paleo.'),
('Motor hadrónico', 'Crea un campo eléctrico al entrar en combate y potencia el ataque especial.')
ON CONFLICT (name) DO NOTHING;

-- Inserción de Pokémon emblemáticos (WikiDex / Artwork Oficial)
INSERT INTO pokemons (id, national_number, name_es, name_en, height_m, weight_kg, habitat, generation_id, image_url, metadata) VALUES
(1, 25, 'Pikachu', 'Pikachu', 0.4, 6.0, 'Bosques', 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png', '{"edad": 5, "categoria": "Ratón"}'::jsonb),
(2, 4, 'Charmander', 'Charmander', 0.6, 8.5, 'Montañas', 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/4.png', '{"edad": 4, "categoria": "Lagartija"}'::jsonb),
(3, 1, 'Bulbasaur', 'Bulbasaur', 0.7, 6.9, 'Praderas', 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1.png', '{"edad": 3, "categoria": "Semilla"}'::jsonb),
(4, 7, 'Squirtle', 'Squirtle', 0.5, 9.0, 'Ríos y Lagos', 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/7.png', '{"edad": 3, "categoria": "Tortuguita"}'::jsonb),
(5, 94, 'Gengar', 'Gengar', 1.5, 40.5, 'Cuevas', 1, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png', '{"edad": 7, "categoria": "Sombra"}'::jsonb),
(6, 448, 'Lucario', 'Lucario', 1.2, 54.0, 'Montañas', 4, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/448.png', '{"edad": 6, "categoria": "Aura"}'::jsonb),
(7, 658, 'Greninja', 'Greninja', 1.5, 40.0, 'Zonas Húmedas', 6, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/658.png', '{"edad": 5, "categoria": "Ninja"}'::jsonb),
(8, 1007, 'Koraidon', 'Koraidon', 2.5, 303.0, 'Área Cero', 9, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1007.png', '{"edad": 100, "categoria": "Paradoja"}'::jsonb),
(9, 1008, 'Miraidon', 'Miraidon', 2.8, 240.0, 'Área Cero', 9, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/1008.png', '{"edad": 100, "categoria": "Paradoja"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Tipos de los Pokémon
INSERT INTO pokemon_types (pokemon_id, type_id, slot) VALUES
(1, 1, 1), -- Pikachu: Eléctrico
(2, 2, 1), -- Charmander: Fuego
(3, 4, 1), (3, 13, 2), -- Bulbasaur: Planta / Veneno
(4, 3, 1), -- Squirtle: Agua
(5, 9, 1), (5, 13, 2), -- Gengar: Fantasma / Veneno
(6, 12, 1), (6, 16, 2), -- Lucario: Lucha / Acero
(7, 3, 1), (7, 17, 2), -- Greninja: Agua / Siniestro
(8, 12, 1), (8, 10, 2), -- Koraidon: Lucha / Dragón
(9, 1, 1), (9, 10, 2)   -- Miraidon: Eléctrico / Dragón
ON CONFLICT DO NOTHING;

-- Habilidades
INSERT INTO pokemon_abilities (pokemon_id, ability_id, is_hidden, slot) VALUES
(1, 1, false, 1), (1, 2, true, 2),
(2, 3, false, 1),
(3, 4, false, 1),
(4, 5, false, 1),
(5, 6, false, 1),
(6, 7, false, 1),
(7, 8, true, 1),
(8, 9, false, 1),
(9, 10, false, 1)
ON CONFLICT DO NOTHING;

-- Estadísticas Base
INSERT INTO pokemon_stats (pokemon_id, hp, attack, defense, sp_attack, sp_defense, speed) VALUES
(1, 35, 55, 40, 50, 50, 90),
(2, 39, 52, 43, 60, 50, 65),
(3, 45, 49, 49, 65, 65, 45),
(4, 44, 48, 65, 50, 64, 43),
(5, 60, 65, 60, 130, 75, 110),
(6, 70, 110, 70, 115, 70, 90),
(7, 72, 95, 67, 103, 71, 122),
(8, 100, 135, 115, 85, 100, 135),
(9, 100, 85, 100, 135, 115, 135)
ON CONFLICT DO NOTHING;
