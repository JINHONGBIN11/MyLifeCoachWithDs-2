require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

// 在Vercel环境中使用适当的端口
const PORT = process.env.PORT || 3000;

// 配置CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

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

        // 设置超时
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000); // 25秒超时

        try {
            // 调用DeepSeek API
            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: messages,
                    temperature: moodMap[conversation.mood] || 0.6,
                    max_tokens: 1000, // 减少token数以加快响应
                    stream: false
                }),
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('DeepSeek API 错误响应:', errorText);
                throw new Error(`API请求失败: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message || '未知错误');
            }

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error('API响应格式错误');
            }

            const aiResponse = data.choices[0].message.content;

            // 保存AI回复到对话历史
            conversation.messages.push({
                role: 'assistant',
                content: aiResponse
            });

            // 返回响应
            res.json({ content: aiResponse });

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('API请求超时，请稍后重试');
            }
            throw error;
        }
    } catch (error) {
        console.error('处理聊天请求时出错:', error);
        res.status(error.message.includes('API请求超时') ? 504 : 500)
           .json({ error: error.message || '处理请求失败' });
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

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 启动服务器
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`服务器运行在端口 ${PORT}`);
    });
}

module.exports = app; 