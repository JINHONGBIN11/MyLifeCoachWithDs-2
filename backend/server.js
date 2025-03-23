require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// 在Vercel环境中使用适当的端口
const PORT = process.env.PORT || 3001;

// 配置CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// 静态文件服务 - 根据环境调整路径
const frontendPath = process.env.NODE_ENV === 'production' ? './frontend' : '../frontend';
app.use(express.static(frontendPath));

// 根路径处理
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: frontendPath });
});

// 内存存储
const conversations = new Map();

// 心情映射
const moodMap = {
    happy: 1,
    excited: 0.8,
    peaceful: 0.6,
    confused: 0.4,
    anxious: 0.3,
    sad: 0.2,
    angry: 0.1,
    tired: 0.5
};

// 心情对应的系统提示词
const moodPrompts = {
    happy: "你现在心情愉快，让我们继续保持这种积极的状态。",
    excited: "你感到兴奋，这种能量很棒！让我们把它转化为动力。",
    peaceful: "你感到平静，这是一个很好的状态，让我们保持这种平和。",
    confused: "你感到困惑，这是正常的，让我们一起理清思路。",
    anxious: "你感到焦虑，让我们一起来缓解这种情绪。",
    sad: "你感到难过，我在这里倾听和支持你。",
    angry: "你感到生气，让我们一起来处理这种情绪。",
    tired: "你感到疲惫，让我们来调整一下状态。"
};

// 处理聊天请求
app.post('/api/chat', async (req, res) => {
    try {
        const { content, mood, conversationId } = req.body;
        
        if (!content || !conversationId) {
            return res.status(400).json({ error: '缺少必要参数' });
        }

        if (!process.env.DEEPSEEK_API_KEY) {
            return res.status(500).json({ error: 'API密钥未配置' });
        }
        
        let conversation = conversations.get(conversationId);
        if (!conversation) {
            conversation = {
                id: conversationId,
                messages: [],
                mood: mood || 'peaceful',
                title: content.slice(0, 20) + (content.length > 20 ? '...' : ''),
                createdAt: Date.now()
            };
            conversations.set(conversationId, conversation);
        }

        // 添加用户消息
        conversation.messages.push({
            role: 'user',
            content: content
        });

        // 准备系统消息
        const systemMessage = {
            role: 'system',
            content: `你是一个富有同理心的AI生活教练。${moodPrompts[conversation.mood] || moodPrompts.peaceful}`
        };

        // 准备发送到API的消息
        const messages = [
            systemMessage,
            ...conversation.messages.slice(-5) // 只发送最近的5条消息以减少处理时间
        ];

        // 设置超时 - 增加到50秒以适应Vercel环境
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            console.log('API请求即将超时，正在中止请求...');
            controller.abort();
        }, 50000); // 50秒超时

        // 定义重试函数
        async function callAPIWithRetry(apiUrl, requestOptions, maxRetries = 2) {
            let lastError = null;
            
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    // 如果是重试，记录重试信息
                    if (attempt > 0) {
                        console.log(`正在进行第 ${attempt} 次重试，共 ${maxRetries} 次重试机会...`);
                        // 重试前等待一段时间，避免频繁请求
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                    
                    // 发送请求
                    const response = await fetch(apiUrl, requestOptions);
                    return response;
                } catch (error) {
                    console.error(`API调用失败 (尝试 ${attempt+1}/${maxRetries+1}):`, error.message);
                    lastError = error;
                    
                    // 如果是最后一次尝试，或者是不应该重试的错误，则抛出
                    if (attempt === maxRetries || error.name !== 'AbortError' && !error.message.includes('ECONNRESET')) {
                        throw error;
                    }
                }
            }
            
            // 如果所有重试都失败，抛出最后一个错误
            throw lastError;
        }
        
        try {
            // 记录API调用信息（不包含敏感信息）
            console.log('准备调用DeepSeek API，模型：deepseek-chat，心情：', conversation.mood);
            
            // 准备API请求参数
            const apiUrl = 'https://api.deepseek.com/v1/chat/completions';
            const requestBody = {
                model: 'deepseek-chat',
                messages: messages,
                temperature: moodMap[conversation.mood] || 0.6,
                max_tokens: 500,
                stream: false
            };
            
            const requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            };
            
            // 使用重试机制调用API
            let response;
            try {
                response = await callAPIWithRetry(apiUrl, requestOptions, 3);
                clearTimeout(timeout);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage;
                    
                    switch (response.status) {
                        case 401:
                            errorMessage = '认证失败：请检查API密钥是否有效';
                            break;
                        case 429:
                            errorMessage = '请求过多：已超过API调用限制，请稍后再试';
                            break;
                        case 500:
                        case 502:
                        case 503:
                        case 504:
                            errorMessage = 'DeepSeek服务器错误：请稍后再试';
                            break;
                        default:
                            errorMessage = `API请求失败: ${response.status}`;
                    }
                    
                    console.error('DeepSeek API错误:', {
                        status: response.status,
                        message: errorMessage,
                        details: errorText
                    });
                    
                    throw new Error(errorMessage);
                }
                
                const data = await response.json();
                
                if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
                    throw new Error('API响应格式无效');
                }
                const aiResponse = data.choices[0].message.content;
                
                // 保存AI回复到对话历史
                conversation.messages.push({
                    role: 'assistant',
                    content: aiResponse,
                    timestamp: Date.now()
                });
                
                // 记录成功响应
                console.log('成功获取AI回复，长度:', aiResponse.length);
                
                // 返回成功响应
                res.json({
                    status: 'success',
                    content: aiResponse,
                    timestamp: Date.now()
                });
            } catch (error) {
            clearTimeout(timeout);
            
            let errorDetails = {
                type: error.name,
                message: error.message,
                timestamp: new Date().toISOString(),
                conversationId: conversationId
            };
            
            if (error.name === 'AbortError') {
                errorDetails.code = 'TIMEOUT';
                errorDetails.message = 'API请求超时，请稍后重试';
                console.error('API请求超时:', errorDetails);
            } else if (error.response) {
                errorDetails.code = 'API_ERROR';
                errorDetails.status = error.response.status;
                console.error('API响应错误:', errorDetails);
            } else if (error.request) {
                errorDetails.code = 'NETWORK_ERROR';
                console.error('网络请求失败:', errorDetails);
            } else {
                errorDetails.code = 'UNKNOWN_ERROR';
                console.error('未知错误:', errorDetails);
            }
            
            throw errorDetails;
        }
    } catch (error) {
        let statusCode = 500;
        let errorResponse = {
            error: error.message || '处理请求失败',
            code: error.code || 'INTERNAL_ERROR',
            timestamp: Date.now(),
            requestId: `req_${Date.now().toString(36)}`
        };
        
        switch (error.code) {
            case 'TIMEOUT':
                statusCode = 504;
                break;
            case 'API_ERROR':
                statusCode = error.status || 500;
                break;
            case 'NETWORK_ERROR':
                statusCode = 503;
                break;
            case 'UNAUTHORIZED':
                statusCode = 401;
                break;
            case 'RATE_LIMIT':
                statusCode = 429;
                break;
        }
        
        console.error('请求处理失败:', {
            ...errorResponse,
            conversationId: conversationId,
            stack: error.stack
        });
        
        res.status(statusCode).json(errorResponse);
    }
});

// 获取所有对话
app.get('/api/conversations', (req, res) => {
    try {
        const conversationsList = Array.from(conversations.values())
            .sort((a, b) => b.createdAt - a.createdAt);
        res.json(conversationsList);
    } catch (error) {
        console.error('获取对话列表失败:', error);
        res.status(500).json({ error: '获取对话列表失败' });
    }
});

// 心情分析API
app.get('/api/mood-analysis', (req, res) => {
    try {
        // 从对话历史中提取心情数据
        const moodData = [];
        conversations.forEach(conv => {
            if (conv.mood) {
                moodData.push({
                    conversationId: conv.id,
                    mood: conv.mood,
                    score: moodMap[conv.mood] || 0.5,
                    timestamp: conv.createdAt
                });
            }
        });
        
        // 计算心情统计数据
        const moodDistribution = {};
        let totalScore = 0;
        
        moodData.forEach(item => {
            moodDistribution[item.mood] = (moodDistribution[item.mood] || 0) + 1;
            totalScore += item.score;
        });
        
        const average = moodData.length > 0 ? totalScore / moodData.length : 0;
        const mostFrequent = Object.entries(moodDistribution)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || 'peaceful';
        
        res.json({
            moodData,
            moodStats: {
                average,
                mostFrequent,
                moodDistribution
            }
        });
    } catch (error) {
        console.error('获取心情分析失败:', error);
        res.status(500).json({ error: '获取心情分析失败' });
    }
});

// 健康检查 - 增强版
app.get('/api/health', (req, res) => {
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    
    res.json({ 
        status: 'ok',
        timestamp: Date.now(),
        uptime: uptime,
        memory: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB'
        },
        conversations: conversations.size,
        environment: process.env.NODE_ENV || 'development'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
});

module.exports = app;