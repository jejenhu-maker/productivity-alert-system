// 測試 productivity.ai.richpharmacy.com 部署狀態
const https = require('https');

async function testDeployment() {
    const baseUrl = 'https://productivity.ai.richpharmacy.com';
    const endpoints = [
        '/productivity/api/health',
        '/productivity',
        '/productivity/input.html'
    ];

    console.log('🔍 測試 productivity.ai.richpharmacy.com 部署狀態...\n');

    for (const endpoint of endpoints) {
        const url = baseUrl + endpoint;
        try {
            const response = await fetch(url, { 
                method: 'GET',
                timeout: 10000 
            });
            
            if (response.ok) {
                console.log(`✅ ${endpoint} - 正常運行 (${response.status})`);
                if (endpoint.includes('health')) {
                    const data = await response.json();
                    console.log(`   系統消息: ${data.message}`);
                }
            } else {
                console.log(`⚠️  ${endpoint} - HTTP ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ ${endpoint} - ${error.message}`);
        }
    }
    
    console.log('\n📋 訪問路徑:');
    console.log('🏠 主儀表板: https://productivity.ai.richpharmacy.com/productivity');
    console.log('✏️ 工時輸入: https://productivity.ai.richpharmacy.com/productivity/input.html');  
    console.log('👥 員工管理: https://productivity.ai.richpharmacy.com/productivity/employees.html');
    console.log('🏪 門市管理: https://productivity.ai.richpharmacy.com/productivity/stores.html');
    console.log('📊 分析報表: https://productivity.ai.richpharmacy.com/productivity/reports.html');
}

testDeployment().catch(console.error);