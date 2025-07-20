// Тестовий скрипт для перевірки роботи сервера
const testServer = async () => {
  const baseUrl = 'http://localhost:3001';
  
  console.log('🔍 Тестування сервера...\n');
  
  try {
    // Тест health endpoint
    console.log('1. Перевірка health endpoint...');
    const healthResponse = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health:', healthData);
    
    // Тест check-subscription endpoint (з тестовими даними)
    console.log('\n2. Перевірка check-subscription endpoint...');
    const testData = {
      userId: 123456789,
      channel: '@MiniAppsUkraine',
      initData: 'test_init_data'
    };
    
    const subscriptionResponse = await fetch(`${baseUrl}/api/check-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    const subscriptionData = await subscriptionResponse.json();
    console.log('📋 Subscription response:', subscriptionData);
    
  } catch (error) {
    console.error('❌ Помилка тестування:', error.message);
    console.log('\n💡 Переконайтеся, що сервер запущено: npm run dev');
  }
};

// Запуск тестів
testServer(); 