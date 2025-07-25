-- Таблиця користувачів бота
CREATE TABLE bot_users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  language_code VARCHAR(10),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_interaction TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблиця розсилок
CREATE TABLE broadcasts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  button_text VARCHAR(100),
  button_url TEXT,
  media_type VARCHAR(20), -- 'photo', 'video', 'document', 'audio'
  media_url TEXT, -- URL або file_id медіафайлу
  media_caption TEXT, -- підпис для медіа (якщо відрізняється від основного повідомлення)
  entities JSONB, -- Telegram entities для збереження форматування
  status VARCHAR(20) DEFAULT 'draft',
  total_users INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Індекси для швидкості
CREATE INDEX idx_bot_users_telegram_id ON bot_users(telegram_id);
CREATE INDEX idx_bot_users_active ON bot_users(is_active);

-- Додаємо колонки до існуючої таблиці (якщо таблиця вже існує)
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_type VARCHAR(20);
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS media_caption TEXT;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS entities JSONB; 