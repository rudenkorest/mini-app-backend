-- Додаємо поле link до таблиці locations
ALTER TABLE locations 
ADD COLUMN IF NOT EXISTS link TEXT;

-- Оновлюємо існуючі записи з корисними посиланнями
UPDATE locations 
SET link = CASE 
    WHEN title = 'Kyiv Food Market' THEN 'https://www.instagram.com/bessarabsky_market/'
    WHEN title = 'Ibiza' THEN 'https://ibiza.com.ua/'
    WHEN title = 'Pizza Spot' THEN 'https://www.celentano.com.ua/'
    WHEN title = 'Supabase Club' THEN 'https://supabase.com/'
    ELSE 'https://kyivcity.gov.ua/'
END; 