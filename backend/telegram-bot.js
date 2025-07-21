require('dotenv').config();
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Ініціалізація клієнтів
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Конфігурація
const TARGET_CHANNEL_ID = parseInt(process.env.PARSING_CHANNEL_ID) || -1001234567890; // Тестовий канал
const HASHTAG_FILTER = '#заклад';

class LocationBot {
  constructor() {
    this.setupBot();
  }

  setupBot() {
    // Обробка нових повідомлень з каналу
    bot.on('channel_post', (ctx) => {
      this.handleChannelPost(ctx);
    });

    // Системні команди для відладки
    bot.command('status', (ctx) => {
      ctx.reply('🤖 Бот активний і відслідковує канал для постів з #заклад');
    });

    bot.command('test', async (ctx) => {
      const testText = `
🏪 Нова локація #заклад

📍 Lavka Coffee
Затишна кав'ярня в центрі міста з авторськими напоями та домашньою випічкою.

📍 Адреса: Київ, вул. Хрещатик, 25
      `;
      
      ctx.reply('🧪 Тестую обробку тексту...');
      const result = await this.processWithChatGPT(testText);
      
      // Додаємо тестове посилання
      result.link = this.generatePostLink({ message_id: 123 });
      
      ctx.reply(`✅ Результат:\n${JSON.stringify(result, null, 2)}`);
    });

    // Запуск бота
    bot.launch().then(() => {
      console.log('🤖 Location Bot запущено!');
      console.log(`📺 Парсинг каналу: ${TARGET_CHANNEL_ID}`);
      console.log(`📺 Підписка каналу: ${process.env.TELEGRAM_CHANNEL}`);
      console.log(`🏷 Фільтр: ${HASHTAG_FILTER}`);
    });

    // Graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  }

  async handleChannelPost(ctx) {
    try {
      const message = ctx.channelPost || ctx.message;
      
      // Перевіряємо чи це потрібний канал
      if (message.chat.id !== TARGET_CHANNEL_ID) {
        return;
      }

      const text = message.text || message.caption || '';
      
      // Перевіряємо наявність хештегу #заклад
      if (!text.includes(HASHTAG_FILTER)) {
        console.log('📝 Пост без хештегу #заклад, пропускаємо');
        return;
      }

      console.log('🎯 Знайдено пост з #заклад!');
      console.log('📝 Текст:', text.substring(0, 100) + '...');

      // Отримуємо URL зображень
      const imageUrls = await this.extractImageUrls(message);
      console.log('🖼 Знайдено зображень:', imageUrls.length);

      // Обробляємо текст через ChatGPT
      const locationData = await this.processWithChatGPT(text);
      
      if (!locationData) {
        console.log('❌ Не вдалося обробити текст');
        return;
      }

      // Додаємо URL зображення (беремо перше)
      locationData.avatar = imageUrls.length > 0 ? imageUrls[0] : null;

      // Додаємо посилання на оригінальний пост
      locationData.link = this.generatePostLink(message);

      // Зберігаємо в Supabase
      await this.saveToSupabase(locationData);

    } catch (error) {
      console.error('❌ Помилка обробки поста:', error);
    }
  }

  async extractImageUrls(message) {
    const imageUrls = [];

    try {
      // Перевіряємо фото
      if (message.photo && message.photo.length > 0) {
        // Беремо найбільше фото
        const largestPhoto = message.photo[message.photo.length - 1];
        const file = await bot.telegram.getFile(largestPhoto.file_id);
        const imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        imageUrls.push(imageUrl);
      }

      // Перевіряємо альбом фото
      if (message.media_group_id) {
        // Для медіа-групи може потрібна додаткова логіка
        console.log('📸 Знайдено медіа-групу, обробляємо перше фото');
      }

      // Перевіряємо документи (якщо це зображення)
      if (message.document && message.document.mime_type && message.document.mime_type.startsWith('image/')) {
        const file = await bot.telegram.getFile(message.document.file_id);
        const imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
        imageUrls.push(imageUrl);
      }

    } catch (error) {
      console.error('❌ Помилка отримання зображень:', error);
    }

    return imageUrls;
  }

  generatePostLink(message) {
    try {
      // Для приватних каналів посилання формується як t.me/c/CHANNEL_ID/MESSAGE_ID
      // Потрібно видалити префікс -100 з channel ID
      const channelId = Math.abs(TARGET_CHANNEL_ID).toString().substring(3);
      const messageId = message.message_id;
      
      const postLink = `https://t.me/c/${channelId}/${messageId}`;
      console.log(`🔗 Генерую посилання на пост: ${postLink}`);
      
      return postLink;
    } catch (error) {
      console.error('❌ Помилка генерації посилання:', error);
      return null;
    }
  }

  async processWithChatGPT(text) {
    try {
      console.log('🤖 Обробляю текст через ChatGPT...');

      const prompt = `Ти маєш розпізнавати надіслані тексти та виділяти з нього наступні дані, які будуть використовуватися в таблиці базі даних. Критерії:

- назва закладу, локації
- опис, який має передати всю суть та цікавинку публікації, найчастіше ця інформація в першому абзаці, максимум 10 слів
- адресу, у форматі Київ, вул. ***
- широта та довгота цієї адреси

ТЕКСТ ДЛЯ АНАЛІЗУ:
${text}

Відповідь надай СТРОГО в JSON форматі:
{
  "title": "назва закладу",
  "description": "короткий опис (максимум 10 слів)",
  "address": "адреса у форматі Київ, вул. ***",
  "latitude": 50.4501,
  "longitude": 30.5234
}

Для координат використовуй реальні координати адреси в Києві. Якщо адреса неточна, використай приблизні координати району.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: "system",
            content: "Ти асистент для розпізнавання локацій з тексту. Відповідай тільки в JSON форматі з українською мовою для назв та описів."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.1
      });

      const responseText = completion.choices[0].message.content.trim();
      console.log('🤖 ChatGPT відповідь:', responseText);

      // Парсимо JSON
      let locationData;
      try {
        locationData = JSON.parse(responseText);
      } catch (e) {
        console.error('❌ Помилка парсингу JSON від ChatGPT:', e);
        return null;
      }

      // Валідація даних
      if (!locationData.title || !locationData.description || !locationData.address) {
        console.error('❌ Неповні дані від ChatGPT');
        return null;
      }

      // Перевірка координат
      if (typeof locationData.latitude !== 'number' || typeof locationData.longitude !== 'number') {
        console.error('❌ Некоректні координати від ChatGPT');
        // Задаємо дефолтні координати центру Києва
        locationData.latitude = 50.4501;
        locationData.longitude = 30.5234;
      }

      return locationData;

    } catch (error) {
      console.error('❌ Помилка ChatGPT:', error);
      return null;
    }
  }

  async saveToSupabase(locationData) {
    try {
      console.log('💾 Зберігаю в Supabase:', locationData);

      const record = {
        title: locationData.title,
        description: locationData.description,
        address: locationData.address,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        avatar: locationData.avatar,
        link: locationData.link, // Посилання на оригінальний пост
        is_active: true,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('locations')
        .insert(record)
        .select()
        .single();

      if (error) {
        console.error('❌ Помилка Supabase:', error);
        return false;
      }

      console.log('✅ Локацію збережено з ID:', data.id);
      console.log('📍', data.title, '-', data.address);
      console.log('🔗 Посилання на пост:', data.link);
      
      return true;

    } catch (error) {
      console.error('❌ Помилка збереження:', error);
      return false;
    }
  }
}

module.exports = LocationBot; 