require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

class BroadcastManager {
  constructor(bot) {
    this.bot = bot;
    this.pendingBroadcasts = new Map(); // Зберігаємо незавершені розсилки
    this.isAdmin = (userId) => {
      const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [];
      return adminIds.includes(userId);
    };
  }

  // Початок інтерактивного створення розсилки
  startInteractiveBroadcast(userId) {
    this.pendingBroadcasts.set(userId, {
      step: 'waiting_message',
      title: '',
      message: '',
      entities: [],
      media: null,
      button_text: null,
      button_url: null
    });
  }

  // Обробка повідомлення від адміна
  async handleBroadcastMessage(ctx) {
    const userId = ctx.from.id;
    const pending = this.pendingBroadcasts.get(userId);
    
    if (!pending) return false; // Не в процесі створення розсилки

    if (pending.step === 'waiting_message') {
      // Зберігаємо повідомлення та медіа
      pending.message = ctx.message.text || ctx.message.caption || '';
      
      // Зберігаємо entities для збереження форматування
      pending.entities = ctx.message.entities || ctx.message.caption_entities || [];
      
      // Обробляємо медіа якщо є
      if (ctx.message.photo) {
        pending.media = {
          type: 'photo',
          file_id: ctx.message.photo[ctx.message.photo.length - 1].file_id
        };
      } else if (ctx.message.video) {
        pending.media = {
          type: 'video', 
          file_id: ctx.message.video.file_id
        };
      } else if (ctx.message.document) {
        pending.media = {
          type: 'document',
          file_id: ctx.message.document.file_id
        };
      } else if (ctx.message.audio) {
        pending.media = {
          type: 'audio',
          file_id: ctx.message.audio.file_id
        };
      } else if (ctx.message.voice) {
        pending.media = {
          type: 'voice',
          file_id: ctx.message.voice.file_id
        };
      } else if (ctx.message.animation) {
        pending.media = {
          type: 'animation',
          file_id: ctx.message.animation.file_id
        };
      }

      // Переходимо до вибору кнопки
      pending.step = 'waiting_button_choice';
      
      await ctx.reply('📝 Повідомлення збережено!\n\n🔘 Хочете додати кнопку до цієї розсилки?', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Так, додати кнопку', callback_data: 'btn_add_button' },
              { text: '❌ Ні, без кнопки', callback_data: 'btn_no_button' }
            ]
          ]
        }
      });
      
      return true;
    }
    
    if (pending.step === 'waiting_button_text') {
      const parts = ctx.message.text.split(' | ');
      if (parts.length !== 2) {
        await ctx.reply('❌ Формат: [Текст кнопки] | [Посилання]\n\nПриклад: Детальніше | https://t.me/channel');
        return true;
      }
      
      pending.button_text = parts[0].trim();
      pending.button_url = parts[1].trim();
      
      // Показуємо превʼю та фінальні кнопки
      await this.showBroadcastPreview(ctx, pending);
      return true;
    }

    return false;
  }

  // Показ превʼю розсилки
  async showBroadcastPreview(ctx, pending) {
    await ctx.reply('📋 Превʼю розсилки:\n────────────────');
    
    // Відправляємо повідомлення як буде виглядати для користувачів
    const messageOptions = {};
    
    // Використовуємо entities якщо є, інакше HTML
    if (pending.entities && pending.entities.length > 0) {
      messageOptions.entities = pending.entities;
    } else {
      messageOptions.parse_mode = 'HTML';
    }
    
    if (pending.button_text && pending.button_url) {
      messageOptions.reply_markup = {
        inline_keyboard: [[
          { text: pending.button_text, url: pending.button_url }
        ]]
      };
    }
    
    if (pending.media) {
      messageOptions.caption = pending.message;
      
      // Для медіа потрібно використовувати caption_entities
      if (pending.entities && pending.entities.length > 0) {
        messageOptions.caption_entities = pending.entities;
        delete messageOptions.entities;
        delete messageOptions.parse_mode;
      }
      
      switch (pending.media.type) {
        case 'photo':
          await ctx.replyWithPhoto(pending.media.file_id, messageOptions);
          break;
        case 'video':
          await ctx.replyWithVideo(pending.media.file_id, messageOptions);
          break;
        case 'document':
          await ctx.replyWithDocument(pending.media.file_id, messageOptions);
          break;
        case 'audio':
          await ctx.replyWithAudio(pending.media.file_id, messageOptions);
          break;
        case 'voice':
          await ctx.replyWithVoice(pending.media.file_id, messageOptions);
          break;
        case 'animation':
          await ctx.replyWithAnimation(pending.media.file_id, messageOptions);
          break;
      }
    } else {
      await ctx.reply(pending.message, messageOptions);
    }
    
    // Фінальні кнопки
    await ctx.reply('────────────────\n🚀 Готові до відправки?', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📢 Надіслати всім', callback_data: 'btn_send_broadcast' },
            { text: '❌ Скасувати', callback_data: 'btn_cancel_broadcast' }
          ]
        ]
      }
    });
    
    pending.step = 'waiting_final_action';
  }

  // Обробка callback кнопок
  async handleCallback(ctx) {
    const userId = ctx.from.id;
    const data = ctx.callbackQuery.data;
    const pending = this.pendingBroadcasts.get(userId);
    
    if (!pending) {
      await ctx.answerCbQuery('❌ Сесія застаріла');
      return;
    }
    
    if (data === 'btn_add_button') {
      pending.step = 'waiting_button_text';
      await ctx.editMessageText('🔘 Надішліть кнопку в форматі:\n[Текст кнопки] | [Посилання]\n\nПриклад:\nДетальніше | https://t.me/channel');
      await ctx.answerCbQuery();
      
    } else if (data === 'btn_no_button') {
      await this.showBroadcastPreview(ctx, pending);
      await ctx.answerCbQuery();
      
    } else if (data === 'btn_send_broadcast') {
      await ctx.editMessageText('📢 Розпочинаю розсилку...');
      await this.executeBroadcast(ctx, pending);
      await ctx.answerCbQuery();
      
    } else if (data === 'btn_cancel_broadcast') {
      this.pendingBroadcasts.delete(userId);
      await ctx.editMessageText('❌ Розсилку скасовано');
      await ctx.answerCbQuery();
    }
  }

  // Виконання розсилки
  async executeBroadcast(ctx, pending) {
    try {
      // Створюємо запис в базі
      const broadcast = await this.createBroadcast(
        `Розсилка ${new Date().toLocaleString('uk-UA')}`,
        pending.message,
        pending.button_text,
        pending.button_url,
        pending.media?.type,
        pending.media?.file_id,
        pending.message, // mediaCaption
        pending.entities // entities
      );

      if (broadcast) {
        await this.startBroadcast(broadcast.id, ctx.from.id);
        this.pendingBroadcasts.delete(ctx.from.id);
      } else {
        await ctx.reply('❌ Помилка створення розсилки');
      }
    } catch (error) {
      console.error('❌ Помилка виконання розсилки:', error);
      await ctx.reply(`❌ Помилка: ${error.message}`);
    }
  }

  // Зберігання користувача при першій взаємодії з ботом
  async saveUser(ctx) {
    try {
      const user = ctx.from;
      if (!user || user.is_bot) return;

      const userData = {
        telegram_id: user.id,
        username: user.username || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        language_code: user.language_code || 'uk',
        last_interaction: new Date().toISOString()
      };

      // Додаємо або оновлюємо користувача
      const { error } = await supabase
        .from('bot_users')
        .upsert(userData, { 
          onConflict: 'telegram_id',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error('❌ Помилка збереження користувача:', error);
      } else {
        console.log(`👤 Користувач збережений: ${user.first_name} (@${user.username})`);
      }
    } catch (error) {
      console.error('❌ Помилка saveUser:', error);
    }
  }

  // Створення нової розсилки
  async createBroadcast(title, message, buttonText = null, buttonUrl = null, mediaType = null, mediaUrl = null, mediaCaption = null, entities = null) {
    try {
      const { data, error } = await supabase
        .from('broadcasts')
        .insert({
          title,
          message,
          button_text: buttonText,
          button_url: buttonUrl,
          media_type: mediaType,
          media_url: mediaUrl,
          media_caption: mediaCaption,
          entities: entities ? JSON.stringify(entities) : null,
          status: 'draft'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Помилка створення розсилки:', error);
      return null;
    }
  }

  // Запуск розсилки
  async startBroadcast(broadcastId, adminUserId) {
    try {
      // Отримуємо розсилку
      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', broadcastId)
        .single();

      if (broadcastError || !broadcast) {
        throw new Error('Розсилку не знайдено');
      }

      // Отримуємо активних користувачів
      const { data: users, error: usersError } = await supabase
        .from('bot_users')
        .select('telegram_id')
        .eq('is_active', true);

      if (usersError) throw usersError;

      console.log(`📢 Почати розсилку "${broadcast.title}" для ${users.length} користувачів`);

      // Оновлюємо статус розсилки
      await supabase
        .from('broadcasts')
        .update({ 
          status: 'sending', 
          total_users: users.length
        })
        .eq('id', broadcastId);

      // Повідомляємо адміна про початок
      await this.bot.telegram.sendMessage(
        adminUserId,
        `📢 Розсилка "${broadcast.title}" розпочата!\n👥 Користувачів: ${users.length}`
      );

      // Відправляємо повідомлення користувачам
      let sentCount = 0;
      let failedCount = 0;

      for (const user of users) {
        try {
          await this.sendBroadcastMessage(user.telegram_id, broadcast);
          sentCount++;
          
          // Пауза між повідомленнями (Telegram rate limits)
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          failedCount++;
          console.error(`❌ Помилка відправки користувачу ${user.telegram_id}:`, error.message);
          
          // Деактивуємо користувача якщо бот заблокований (403 Forbidden)
          if (error.response && error.response.error_code === 403) {
            try {
              await supabase
                .from('bot_users')
                .update({ is_active: false })
                .eq('telegram_id', user.telegram_id);
              
              console.log(`🔴 Користувач ${user.telegram_id} деактивований (бот заблокований)`);
            } catch (dbError) {
              console.error(`❌ Помилка деактивації користувача ${user.telegram_id}:`, dbError);
            }
          }
        }
      }

      // Оновлюємо фінальну статистику
      await supabase
        .from('broadcasts')
        .update({ 
          status: 'completed',
          sent_count: sentCount,
          failed_count: failedCount
        })
        .eq('id', broadcastId);

      // Повідомляємо адміна про завершення
      await this.bot.telegram.sendMessage(
        adminUserId,
        `✅ Розсилка завершена!\n📊 Відправлено: ${sentCount}\n❌ Помилок: ${failedCount}`
      );

      return { sentCount, failedCount };

    } catch (error) {
      console.error('❌ Помилка розсилки:', error);
      
      // Позначаємо розсилку як невдалу
      await supabase
        .from('broadcasts')
        .update({ status: 'failed' })
        .eq('id', broadcastId);

      throw error;
    }
  }

  // Відправка одного повідомлення розсилки
  async sendBroadcastMessage(userId, broadcast) {
    const messageOptions = {};

    // Використовуємо entities якщо є, інакше HTML
    if (broadcast.entities) {
      try {
        const entities = typeof broadcast.entities === 'string' 
          ? JSON.parse(broadcast.entities) 
          : broadcast.entities;
        
        if (entities && entities.length > 0) {
          messageOptions.entities = entities;
        } else {
          messageOptions.parse_mode = 'HTML';
        }
      } catch (error) {
        console.error('❌ Помилка парсингу entities:', error);
        messageOptions.parse_mode = 'HTML';
      }
    } else {
      messageOptions.parse_mode = 'HTML';
    }

    // Додаємо кнопку якщо є
    if (broadcast.button_text && broadcast.button_url) {
      messageOptions.reply_markup = {
        inline_keyboard: [[
          { text: broadcast.button_text, url: broadcast.button_url }
        ]]
      };
    }

    // Якщо є медіа - відправляємо з медіа
    if (broadcast.media_type && broadcast.media_url) {
      const caption = broadcast.media_caption || broadcast.message;
      messageOptions.caption = caption;

      // Для медіа використовуємо caption_entities
      if (broadcast.entities) {
        try {
          const entities = typeof broadcast.entities === 'string' 
            ? JSON.parse(broadcast.entities) 
            : broadcast.entities;
          
          if (entities && entities.length > 0) {
            messageOptions.caption_entities = entities;
            delete messageOptions.entities;
            delete messageOptions.parse_mode;
          }
        } catch (error) {
          console.error('❌ Помилка парсингу entities для медіа:', error);
        }
      }

      switch (broadcast.media_type) {
        case 'photo':
          await this.bot.telegram.sendPhoto(userId, broadcast.media_url, messageOptions);
          break;
        case 'video':
          await this.bot.telegram.sendVideo(userId, broadcast.media_url, messageOptions);
          break;
        case 'document':
          await this.bot.telegram.sendDocument(userId, broadcast.media_url, messageOptions);
          break;
        case 'audio':
          await this.bot.telegram.sendAudio(userId, broadcast.media_url, messageOptions);
          break;
        case 'voice':
          await this.bot.telegram.sendVoice(userId, broadcast.media_url, messageOptions);
          break;
        case 'animation':
          await this.bot.telegram.sendAnimation(userId, broadcast.media_url, messageOptions);
          break;
        default:
          // Якщо невідомий тип медіа - відправляємо як звичайне повідомлення
          await this.bot.telegram.sendMessage(userId, broadcast.message, messageOptions);
      }
    } else {
      // Без медіа - звичайне текстове повідомлення
      await this.bot.telegram.sendMessage(userId, broadcast.message, messageOptions);
    }
  }

  // Отримання статистики користувачів
  async getUserStats() {
    try {
      const { data, error } = await supabase
        .from('bot_users')
        .select('is_active');

      if (error) throw error;

      const total = data.length;
      const active = data.filter(u => u.is_active).length;
      const inactive = total - active;

      return { total, active, inactive };
    } catch (error) {
      console.error('❌ Помилка статистики:', error);
      return { total: 0, active: 0, inactive: 0 };
    }
  }
}

module.exports = BroadcastManager;