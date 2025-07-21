const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

// Імпорт бота для парсингу локацій
const LocationBot = require('./telegram-bot');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true
}));

// Функція для верифікації Telegram WebApp данних
function verifyTelegramWebAppData(initData, botToken) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');
    
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    return calculatedHash === hash;
  } catch (error) {
    console.error('Помилка верифікації:', error);
    return false;
  }
}

// Endpoint для перевірки підписки на канал
app.post('/api/check-subscription', async (req, res) => {
  try {
    const { userId, channel, initData } = req.body;
    
    if (!userId || !channel || !initData) {
      return res.status(400).json({ 
        error: 'Не вистачає обов\'язкових параметрів' 
      });
    }
    
    // Верифікуємо дані від Telegram (тимчасово відключено для тестування)
    console.log('Received data:', { userId, channel, initData: initData ? 'present' : 'missing' });
    
    // Тимчасово пропускаємо верифікацію для тестування
    // const isValid = verifyTelegramWebAppData(initData, process.env.BOT_TOKEN);
    // if (!isValid) {
    //   console.log('Verification failed for initData:', initData);
    //   return res.status(401).json({ 
    //     error: 'Недійсні дані Telegram' 
    //   });
    // }
    
    // Перевіряємо підписку через Telegram Bot API
    const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getChatMember`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: channel,
        user_id: userId
      })
    });
    
    const data = await response.json();
    
    console.log('Telegram API response:', data);
    
    if (!data.ok) {
      console.error('Telegram API помилка:', data.description);
      return res.status(500).json({ 
        error: 'Помилка перевірки підписки',
        details: data.description 
      });
    }
    
    // Перевіряємо статус користувача в каналі
    const userStatus = data.result?.status;
    const isSubscribed = ['member', 'administrator', 'creator'].includes(userStatus);
    
    console.log(`User ${userId} status in channel: ${userStatus}, isSubscribed: ${isSubscribed}`);
    
    res.json({ 
      isSubscribed,
      status: userStatus 
    });
    
  } catch (error) {
    console.error('Помилка сервера:', error);
    res.status(500).json({ 
      error: 'Внутрішня помилка сервера' 
    });
  }
});

// Тестовий endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    channel: process.env.TELEGRAM_CHANNEL 
  });
});

app.listen(PORT, () => {
  console.log(`Сервер запущено на порту ${PORT}`);
  console.log(`Канал для перевірки: ${process.env.TELEGRAM_CHANNEL}`);
  
  // Запускаємо бота для парсингу локацій
  if (process.env.BOT_TOKEN && process.env.OPENAI_API_KEY) {
    console.log('🤖 Запускаю Location Bot...');
    new LocationBot();
  } else {
    console.log('⚠️ Location Bot не запущено - відсутні BOT_TOKEN або OPENAI_API_KEY');
  }
}); 