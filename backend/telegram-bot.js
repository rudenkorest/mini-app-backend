require('dotenv').config();
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const BroadcastManager = require('./broadcast-manager');

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
    this.broadcastManager = new BroadcastManager(bot);
    this.setupBot();
  }

  setupBot() {
    // Стартова команда
    bot.start(async (ctx) => {
      await this.sendStartMessage(ctx);
    });

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

    // Зберігаємо користувачів при будь-якій взаємодії
    bot.use(async (ctx, next) => {
      await this.broadcastManager.saveUser(ctx);
      return next();
    });

    // Адмін команди для розсилок
    bot.command('broadcast', async (ctx) => {
      if (!this.broadcastManager.isAdmin(ctx.from.id)) {
        return ctx.reply('❌ Ця команда доступна тільки адміністраторам');
      }
      
      this.broadcastManager.startInteractiveBroadcast(ctx.from.id);
      ctx.reply(`📢 Інтерактивна розсилка запущена!

📝 Надішліть мені повідомлення, яке хочете відправити всім користувачам.

💡 Підтримується:
• HTML форматування (<b>жирний</b>, <i>курсив</i>)
• Медіа файли (фото, відео, документи)
• Комбінації тексту з медіа

🚀 Просто надішліть готове повідомлення!`);
    });

    bot.command('stats', async (ctx) => {
      if (!this.broadcastManager.isAdmin(ctx.from.id)) {
        return ctx.reply('❌ Доступ заборонено');
      }

      const stats = await this.broadcastManager.getUserStats();
      ctx.reply(`📊 Статистика користувачів:
👥 Всього: ${stats.total}
✅ Активних: ${stats.active}
❌ Неактивних: ${stats.inactive}`);
    });

    // Обробка всіх повідомлень для інтерактивної розсилки
    bot.on('message', async (ctx) => {
      if (!this.broadcastManager.isAdmin(ctx.from.id)) {
        return; // Ігноруємо не-адмінів
      }

      // Спробуємо обробити як частину інтерактивної розсилки
      const handled = await this.broadcastManager.handleBroadcastMessage(ctx);
      
      if (!handled) {
        // Якщо не обробили як розсилку, показуємо довідку
        if (ctx.message.text && !ctx.message.text.startsWith('/')) {
          ctx.reply(`💡 Використовуйте /broadcast для створення розсилки`);
        }
      }
    });

    // Обробка callback кнопок
    bot.on('callback_query', async (ctx) => {
      if (!this.broadcastManager.isAdmin(ctx.from.id)) {
        await ctx.answerCbQuery('❌ Доступ заборонено');
        return;
      }

      await this.broadcastManager.handleCallback(ctx);
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

  async sendStartMessage(ctx) {
    try {
      const welcomeText = `<b>Це карта від <a href="https://t.me/+8Bui7KD5WrJiZjli">«Гуляй, Київ»</a>, яка покаже, де в столиці найцікавіше!</b>

Тут усе просто:
📍 Знаходь заклади, локації та події поруч із собою.
🔥 Обирай із перевірених місць – тут лише ті, про які говорять у TikTok, Instagram і на вулицях
🔍 Досліджуй місто по-новому – без зайвих роздумів «куди піти сьогодні».

Натисни кнопку нижче, щоб відкрити інтерактивну карту  ⬇️`;

      // Відправляємо фото з текстом та кнопками
      await ctx.replyWithPhoto(
        'https://tkvtshoprhmgjrgvaeia.supabase.co/storage/v1/object/public/location-images/system%20images/Frame%201686561270.png',
        {
          caption: welcomeText,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🗺️ Відкрити карту',
                  web_app: { url: 'https://map.gulyai-kyiv.com' }
                }
              ]
            ]
          }
        }
      );

      // Відправляємо друге повідомлення через 3 секунди
      setTimeout(async () => {
        try {
          const subscribeText = `<b>📲 Щоб бачити більше й дізнаватись про всі розважальні новини Києва – підпишіться на наш канал <a href="https://t.me/+8Bui7KD5WrJiZjli">«Гуляй, Київ»</a></b>`;

          await ctx.reply(subscribeText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: '📲 Підписатися на канал',
                    url: 'https://t.me/+8Bui7KD5WrJiZjli'
                  }
                ]
              ]
            }
          });
        } catch (error) {
          console.error('❌ Помилка відправки другого повідомлення:', error);
        }
      }, 3000); // 3 секунди затримка

    } catch (error) {
      console.error('❌ Помилка відправки стартового повідомлення:', error);
      // Fallback - звичайне текстове повідомлення
      ctx.reply('🗺️ Вітаємо! Натисніть /status для перевірки роботи бота.');
    }
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
        const largestPhoto = message.photo[message.photo.length - 1];
        const uploadedUrl = await this.downloadAndUploadImage(largestPhoto.file_id);
        if (uploadedUrl) imageUrls.push(uploadedUrl);
      }

      // Перевіряємо альбом фото
      if (message.media_group_id) {
        console.log('📸 Знайдено медіа-групу, обробляємо перше фото');
      }

      // Перевіряємо документи (якщо це зображення)
      if (message.document && message.document.mime_type && message.document.mime_type.startsWith('image/')) {
        const uploadedUrl = await this.downloadAndUploadImage(message.document.file_id);
        if (uploadedUrl) imageUrls.push(uploadedUrl);
      }

    } catch (error) {
      console.error('❌ Помилка отримання зображень:', error);
    }

    return imageUrls;
  }

  // Новий метод для завантаження та збереження зображень в Supabase
  async downloadAndUploadImage(fileId) {
    try {
      // 1. Отримуємо file_path від Telegram
      const file = await bot.telegram.getFile(fileId);
      const telegramUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      
      // 2. Завантажуємо файл
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(telegramUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const buffer = await response.buffer();
      
      // 3. Генеруємо унікальне ім'я файлу
      const fileName = `avatars/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
      
      // 4. Завантажуємо в Supabase Storage
      const { data, error } = await supabase.storage
        .from('location-images')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          cacheControl: '31536000' // 1 рік кешування
        });

      if (error) throw error;

      // 5. Отримуємо публічний URL
      const { data: urlData } = supabase.storage
        .from('location-images')
        .getPublicUrl(fileName);

      console.log(`✅ Зображення збережено: ${urlData.publicUrl}`);
      return urlData.publicUrl;

    } catch (error) {
      console.error(`❌ Помилка завантаження файлу ${fileId}:`, error);
      return null;
    }
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
- опис, який має передати всю суть та цікавинку публікації, найчастіше ця інформація в першому абзаці, завжди намагатися описати 10 словами, перше слова має бути з великої літери.
- адресу, у форматі Київ, вул. ***

ТЕКСТ ДЛЯ АНАЛІЗУ:
${text}

Відповідь надай СТРОГО в JSON форматі:
{
  "title": "назва закладу",
  "description": "короткий опис (максимум 10 слів)",
  "address": "адреса у форматі Київ, вул. ***"
}

ВАЖЛИВО: Не додавай координати - вони будуть отримані автоматично через Google Maps API.`;

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

      // Геокодуємо адресу через Google Maps API
      console.log('🗺️ Отримую координати через Google Maps API...');
      const coords = await this.geocodeAddress(locationData.address);
      
      if (coords) {
        locationData.latitude = coords.latitude;
        locationData.longitude = coords.longitude;
        console.log(`✅ Координати отримано: ${coords.latitude}, ${coords.longitude}`);
      } else {
        console.error('❌ Не вдалося отримати координати, використовую дефолтні');
        locationData.latitude = 50.4501;
        locationData.longitude = 30.5234;
      }

      return locationData;

    } catch (error) {
      console.error('❌ Помилка ChatGPT:', error);
      return null;
    }
  }

  // Додати нову функцію для геокодування
  async geocodeAddress(address) {
    try {
      console.log('🗺️ Геокодую адресу через Google Maps API:', address);
      
      // Потрібно додати GOOGLE_MAPS_API_KEY в .env
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.error('❌ GOOGLE_MAPS_API_KEY не знайдено в .env');
        return null;
      }
      
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address + ', Kyiv, Ukraine')}&key=${apiKey}`
      );
      
      const data = await response.json();
      
      if (data.status === 'OK' && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        const coords = {
          latitude: location.lat,
          longitude: location.lng
        };
        console.log(`✅ Отримано точні координати: ${coords.latitude}, ${coords.longitude}`);
        return coords;
      } else {
        console.error('❌ Помилка геокодування:', data.status);
        return null;
      }
    } catch (error) {
      console.error('❌ Помилка геокодування:', error);
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