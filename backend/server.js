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

        try {
            // 记录API调用信息（不包含敏感信息）
            console.log('准备调用DeepSeek API，模型：deepseek-v3，心情：', conversation.mood);
            console.log('API密钥状态：', process.env.DEEPSEEK_API_KEY ? '已设置' : '未设置');
            
            // 调用DeepSeek API
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: 'deepseek-chat', // 更新为正确的DeepSeek模型名称
                    messages: messages,
                    temperature: moodMap[conversation.mood] || 0.6,
                    max_tokens: 800, // 进一步减少token数以加快响应
                    stream: false
                    // 移除timeout参数，由fetch的AbortController控制
                }),
                signal: controller.signal
            });
            
            console.log('DeepSeek API请求完成，状态码:', response.status);
            
            console.log('DeepSeek API响应状态：', response.status);

            clearTimeout(timeout);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('DeepSeek API 错误响应:', errorText);
                console.error('响应状态码:', response.status);
                console.error('请求头:', JSON.stringify(response.headers.raw()));
                
                // 根据状态码提供更具体的错误信息
                let errorMessage = `API请求失败: ${response.status}`;
                if (response.status === 401) {
                    errorMessage = '认证失败：请检查API密钥是否有效';
                } else if (response.status === 429) {
                    errorMessage = '请求过多：已超过API调用限制，请稍后再试';
                } else if (response.status >= 500) {
                    errorMessage = 'DeepSeek服务器错误：请稍后再试';
                }
                
                throw new Error(`${errorMessage} - ${errorText}`);
            }

            console.log('DeepSeek API响应成功，开始解析数据');
            const data = await response.json();
            console.log('数据解析完成');
            
            if (data.error) {
                console.error('DeepSeek API返回错误:', data.error);
                throw new Error(data.error.message || '未知错误');
            }

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error('API响应格式错误，完整响应:', JSON.stringify(data));
                throw new Error('API响应格式错误');
            }
            
            console.log('成功获取AI回复');

            const aiResponse = data.choices[0].message.content;

            // 保存AI回复到对话历史
            conversation.messages.push({
                role: 'assistant',
                content: aiResponse
            });

            // 返回响应
            res.json({ content: aiResponse });

        } catch (error) {
            clearTimeout(timeout); // 确保清除超时计时器
            
            if (error.name === 'AbortError') {
                console.error('API请求被中止：请求超时');
                throw new Error('API请求超时，请稍后重试');
            }
            
            // 详细记录错误信息
            console.error('API请求失败详情:', {
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack
            });
            
            throw error;
        }
    } catch (error) {
        console.error('处理聊天请求时出错:', error);
        
        // 根据错误类型设置适当的状态码
        let statusCode = 500;
        if (error.message.includes('API请求超时')) {
            statusCode = 504; // Gateway Timeout
        } else if (error.message.includes('API密钥')) {
            statusCode = 401; // Unauthorized
        } else if (error.message.includes('请求失败') && error.message.includes('429')) {
            statusCode = 429; // Too Many Requests
        }
        
        // 返回详细错误信息
        res.status(statusCode).json({ 
            error: error.message || '处理请求失败',
            timestamp: Date.now(),
            requestId: `req_${Date.now().toString(36)}`
        });
        
        // 记录错误发生时间和会话ID
        console.error(`错误发生时间: ${new Date().toISOString()}, 会话ID: ${conversationId || 'unknown'}`);
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