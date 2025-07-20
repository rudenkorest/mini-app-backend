// Скрипт для отримання Chat ID приватного каналу
require('dotenv').config();

const getChatId = async () => {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  
  if (!BOT_TOKEN) {
    console.error('❌ Не знайдено BOT_TOKEN в .env файлі');
    return;
  }
  
  try {
    console.log('🔍 Отримання оновлень від бота...\n');
    
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const data = await response.json();
    
    if (!data.ok) {
      console.error('❌ Помилка API:', data.description);
      return;
    }
    
    console.log('📋 Останні оновлення:');
    
    if (data.result.length === 0) {
      console.log('⚠️ Немає оновлень. Надішліть повідомлення в канал де є ваш бот.');
      return;
    }
    
    // Шукаємо повідомлення з каналів
    data.result.forEach((update, index) => {
      if (update.channel_post) {
        const chat = update.channel_post.chat;
        console.log(`\n${index + 1}. Канал: "${chat.title}"`);
        console.log(`   Chat ID: ${chat.id}`);
        console.log(`   Type: ${chat.type}`);
        console.log(`   Username: ${chat.username || 'приватний канал'}`);
        console.log(`   ✅ Використовуйте це Chat ID: ${chat.id}`);
      }
    });
    
    console.log('\n💡 Скопіюйте Chat ID і вставте в .env файл як TELEGRAM_CHANNEL');
    
  } catch (error) {
    console.error('❌ Помилка:', error.message);
  }
};

// Інструкції
console.log('📋 Інструкція для отримання Chat ID приватного каналу:');
console.log('1. Додайте вашого бота в приватний канал як адміністратора');
console.log('2. Надішліть будь-яке повідомлення в канал');
console.log('3. Запустіть цей скрипт: node get-chat-id.js');
console.log('4. Скопіюйте Chat ID з результатів\n');

getChatId(); 