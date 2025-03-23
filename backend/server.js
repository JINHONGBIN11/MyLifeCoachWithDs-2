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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000); // 9秒超时，Vercel 限制为10秒

    try {
        const { content, mood, conversationId } = req.body;
        
        if (!content || !conversationId) {
            clearTimeout(timeout);
            return res.status(400).json({ 
                error: '缺少必要参数',
                details: {
                    content: !content ? '消息内容不能为空' : undefined,
                    conversationId: !conversationId ? '会话ID不能为空' : undefined
                }
            });
        }

        if (!process.env.DEEPSEEK_API_KEY) {
            clearTimeout(timeout);
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
            ...conversation.messages.slice(-3) // 只发送最近的3条消息以减少处理时间
        ];

        try {
            // 调用DeepSeek API
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: messages,
                    temperature: moodMap[conversation.mood] || 0.6,
                    max_tokens: 300, // 减少token数以加快响应
                    stream: false,
                    presence_penalty: 0.6, // 增加回复的多样性
                    frequency_penalty: 0.6 // 减少重复内容
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API请求失败: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.choices?.[0]?.message?.content) {
                throw new Error('API响应格式错误');
            }

            const aiResponse = data.choices[0].message.content;

            // 保存AI回复到对话历史
            conversation.messages.push({
                role: 'assistant',
                content: aiResponse,
                timestamp: Date.now()
            });

            // 立即返回响应
            return res.json({
                status: 'success',
                content: aiResponse,
                timestamp: Date.now()
            });

        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    } catch (error) {
        clearTimeout(timeout);
        
        let statusCode = 500;
        let errorMessage = '处理请求失败';
        
        if (error.name === 'AbortError') {
            statusCode = 504;
            errorMessage = 'API请求超时，请稍后重试';
        } else if (error.message.includes('API请求失败')) {
            statusCode = 502;
            errorMessage = error.message;
        } else if (error.code === 'ECONNREFUSED') {
            statusCode = 503;
            errorMessage = '无法连接到API服务器';
        }
        
        console.error('请求处理失败:', {
            error: error.message,
            stack: error.stack,
            conversationId
        });
        
        return res.status(statusCode).json({
            error: errorMessage,
            requestId: `req_${Date.now().toString(36)}`
        });
    }
});

// 处理流式聊天请求
app.post('/api/chat/stream', async (req, res) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30秒超时

    try {
        const { content, mood, conversationId } = req.body;
        
        if (!content || !conversationId) {
            clearTimeout(timeout);
            return res.status(400).json({ 
                error: '缺少必要参数',
                details: {
                    content: !content ? '消息内容不能为空' : undefined,
                    conversationId: !conversationId ? '会话ID不能为空' : undefined
                }
            });
        }

        if (!process.env.DEEPSEEK_API_KEY) {
            clearTimeout(timeout);
            return res.status(500).json({ error: 'API密钥未配置' });
        }

        // 设置SSE头部
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

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
            ...conversation.messages.slice(-3)
        ];

        try {
            // 调用DeepSeek API（流式）
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: messages,
                    temperature: moodMap[conversation.mood] || 0.6,
                    max_tokens: 1000,
                    stream: true,
                    presence_penalty: 0.6,
                    frequency_penalty: 0.6
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API请求失败: ${response.status} - ${errorText}`);
            }

            let fullResponse = '';
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') {
                                res.write('data: [DONE]\n\n');
                                continue;
                            }

                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices?.[0]?.delta?.content) {
                                    const content = parsed.choices[0].delta.content;
                                    fullResponse += content;
                                    res.write(`data: ${JSON.stringify({ content })}\n\n`);
                                }
                            } catch (e) {
                                console.error('解析流数据失败:', e);
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }

            // 保存完整回复到对话历史
            if (fullResponse) {
                conversation.messages.push({
                    role: 'assistant',
                    content: fullResponse,
                    timestamp: Date.now()
                });
            }

            res.end();

        } catch (error) {
            clearTimeout(timeout);
            console.error('流式请求处理失败:', error);
            
            // 发送错误事件
            res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
            res.end();
        }
    } catch (error) {
        clearTimeout(timeout);
        console.error('请求处理失败:', error);
        
        if (!res.headersSent) {
            let statusCode = 500;
            let errorMessage = '处理请求失败';
            
            if (error.name === 'AbortError') {
                statusCode = 504;
                errorMessage = 'API请求超时，请稍后重试';
            } else if (error.message.includes('API请求失败')) {
                statusCode = 502;
                errorMessage = error.message;
            } else if (error.code === 'ECONNREFUSED') {
                statusCode = 503;
                errorMessage = '无法连接到API服务器';
            }
            
            return res.status(statusCode).json({
                error: errorMessage,
                requestId: `req_${Date.now().toString(36)}`
            });
        }
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