-- New category structure agreed with the Assistant Hardware Director (25 Sept 2026).
-- Adds a short "what goes in it" description to each category, creates the new
-- categories, moves existing equipment across, and removes old categories that
-- end up empty. Safe to run more than once.

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

INSERT INTO public.categories (name, description) VALUES
  ('Cooling & Environmental',   'Air conditioners, fans and other cooling or ventilation equipment.'),
  ('Display & Presentation',    'Projectors, monitors, TVs and displays, projector screens and other display equipment.'),
  ('Computing Equipment',       'Desktop computers, laptops and peripherals: keyboards, mice, webcams, speakers, headsets.'),
  ('Power & Electrical',        'Extension boards and cables, UPS units, surge protectors, power adapters and chargers.'),
  ('Networking & Connectivity', 'Routers, switches, access points, modems, Ethernet cables, network adapters and patch panels.'),
  ('Audio Equipment',           'Microphones, speakers, amplifiers, mixers and audio cables.'),
  ('Printing & Documentation',  'Printers, scanners, photocopiers and printing accessories.')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- Move equipment from the old categories into the new ones.
UPDATE public.inventory_items AS i
SET category_id = n.id
FROM public.categories AS o, public.categories AS n,
  (VALUES
    ('Computers',            'Computing Equipment'),
    ('Keyboards',            'Computing Equipment'),
    ('Mouse',                'Computing Equipment'),
    ('Monitors',             'Display & Presentation'),
    ('Projectors',           'Display & Presentation'),
    ('Printers',             'Printing & Documentation'),
    ('Networking Equipment', 'Networking & Connectivity'),
    ('Power Equipment',      'Power & Electrical')
  ) AS m(old_name, new_name)
WHERE i.category_id = o.id AND o.name = m.old_name AND n.name = m.new_name;

-- Remove the old categories that no longer hold anything.
-- ("Cables" and "Other" have no obvious new home, so they stay if equipment still uses them.)
DELETE FROM public.categories AS c
WHERE c.name IN ('Computers', 'Keyboards', 'Mouse', 'Monitors', 'Projectors', 'Printers',
                 'Networking Equipment', 'Power Equipment', 'Cables', 'Other')
  AND NOT EXISTS (SELECT 1 FROM public.inventory_items AS i WHERE i.category_id = c.id);

-- Result: every category and how many items it holds.
SELECT c.name, count(i.id) AS items
FROM public.categories AS c
LEFT JOIN public.inventory_items AS i ON i.category_id = c.id
GROUP BY c.name
ORDER BY c.name;
