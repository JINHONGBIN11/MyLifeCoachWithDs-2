require('dotenv').config();
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 配置CORS
app.use(cors());
app.use(express.json());

// 对话历史文件路径
const HISTORY_FILE = path.join(__dirname, 'conversations.json');

// 存储对话历史
let conversations = new Map();

// 加载历史对话
try {
    if (fs.existsSync(HISTORY_FILE)) {
        const historyData = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        conversations = new Map(Object.entries(historyData));
        console.log('成功加载历史对话');
    }
} catch (error) {
    console.error('加载历史对话失败:', error);
}

// 保存对话历史
function saveConversations() {
    try {
        const historyData = Object.fromEntries(conversations);
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyData, null, 2));
        console.log('成功保存对话历史');
    } catch (error) {
        console.error('保存对话历史失败:', error);
    }
}

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

// 心情分析路由
app.get('/api/mood-analysis/:conversationId', (req, res) => {
    console.log('收到心情分析请求:', req.params.conversationId);
    const conversation = conversations.get(req.params.conversationId);
    if (!conversation) {
        console.log('对话不存在');
        return res.status(404).json({ error: '对话不存在' });
    }

    // 分析心情变化
    const moodData = conversation.messages.map(msg => ({
        timestamp: msg.timestamp,
        mood: msg.mood || conversation.mood,
        score: moodMap[msg.mood || conversation.mood]
    }));

    // 计算心情统计
    const moodStats = {
        average: moodData.reduce((acc, curr) => acc + curr.score, 0) / moodData.length,
        mostFrequent: getMostFrequentMood(moodData),
        moodDistribution: getMoodDistribution(moodData)
    };

    console.log('返回心情分析结果');
    res.json({
        moodData,
        moodStats
    });
});

// 获取所有对话的心情分析
app.get('/api/mood-analysis', (req, res) => {
    console.log('收到所有对话的心情分析请求');
    const allMoodData = [];
    conversations.forEach((conv, id) => {
        const moodData = conv.messages.map(msg => ({
            conversationId: id,
            timestamp: msg.timestamp,
            mood: msg.mood || conv.mood,
            score: moodMap[msg.mood || conv.mood]
        }));
        allMoodData.push(...moodData);
    });

    const moodStats = {
        average: allMoodData.reduce((acc, curr) => acc + curr.score, 0) / allMoodData.length,
        mostFrequent: getMostFrequentMood(allMoodData),
        moodDistribution: getMoodDistribution(allMoodData)
    };

    console.log('返回所有对话的心情分析结果');
    res.json({
        moodData: allMoodData,
        moodStats
    });
});

// 辅助函数：获取最频繁的心情
function getMostFrequentMood(moodData) {
    const moodCounts = {};
    moodData.forEach(data => {
        moodCounts[data.mood] = (moodCounts[data.mood] || 0) + 1;
    });
    return Object.entries(moodCounts)
        .sort(([,a], [,b]) => b - a)[0][0];
}

// 辅助函数：获取心情分布
function getMoodDistribution(moodData) {
    const distribution = {};
    moodData.forEach(data => {
        distribution[data.mood] = (distribution[data.mood] || 0) + 1;
    });
    return distribution;
}

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

// WebSocket连接处理
wss.on('connection', (ws, req) => {
    console.log('新的WebSocket连接');
    let currentConversation = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('收到消息:', data);
            
            // 如果是新对话
            if (!currentConversation) {
                currentConversation = {
                    id: Date.now(),
                    messages: [],
                    mood: data.mood || 'peaceful',
                    title: '新对话'
                };
                conversations.set(currentConversation.id, currentConversation);
                console.log('创建新对话:', currentConversation.id);
            }

            // 添加用户消息到对话历史
            currentConversation.messages.push({
                content: data.content,
                isUser: true,
                timestamp: Date.now(),
                mood: data.mood
            });

            // 更新对话标题
            if (currentConversation.messages.length === 1) {
                currentConversation.title = data.content.slice(0, 20) + (data.content.length > 20 ? '...' : '');
            }

            // 保存对话历史
            saveConversations();

            // 构建系统提示词
            const systemPrompt = moodPrompts[data.mood] || moodPrompts.peaceful;
            
            // 构建消息历史
            const messages = [
                { role: "system", content: systemPrompt },
                ...currentConversation.messages.map(msg => ({
                    role: msg.isUser ? "user" : "assistant",
                    content: msg.content
                }))
            ];

            console.log('发送请求到API');
            // 调用API
            const response = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: "deepseek-chat",
                    messages: messages,
                    stream: true
                })
            });

            if (!response.ok) {
                console.error('API请求失败:', response.status, response.statusText);
                throw new Error(`API请求失败: ${response.status}`);
            }

            // 处理流式响应
            let aiResponse = '';
            response.body.on('data', chunk => {
                const lines = chunk.toString().split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            // 添加AI回复到对话历史
                            currentConversation.messages.push({
                                content: aiResponse,
                                isUser: false,
                                timestamp: Date.now()
                            });
                            // 保存对话历史
                            saveConversations();
                            console.log('AI回复完成');
                            // 发送完成消息
                            ws.send(JSON.stringify({
                                type: 'done',
                                content: aiResponse
                            }));
                        } else {
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices && parsed.choices[0].delta.content) {
                                    const content = parsed.choices[0].delta.content;
                                    aiResponse += content;
                                    ws.send(JSON.stringify({
                                        type: 'content',
                                        content: content
                                    }));
                                }
                            } catch (e) {
                                console.error('解析响应数据失败:', e);
                            }
                        }
                    }
                }
            });

            response.body.on('end', () => {
                console.log('响应流结束');
            });

            response.body.on('error', (error) => {
                console.error('响应流错误:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    content: '抱歉，处理响应时出现错误。'
                }));
            });
        } catch (error) {
            console.error('处理消息时出错:', error);
            ws.send(JSON.stringify({
                type: 'error',
                content: '抱歉，处理您的消息时出现错误。'
            }));
        }
    });

    ws.on('close', () => {
        console.log('WebSocket连接关闭');
        // 保存对话历史
        saveConversations();
    });

    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
    });
});

// 获取所有对话
app.get('/api/conversations', (req, res) => {
  try {
    const conversationsArray = Array.from(conversations.values());
    res.json(conversationsArray);
  } catch (error) {
    console.error('获取对话列表失败:', error);
    res.status(500).json({ error: '获取对话列表失败' });
  }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在端口 ${PORT}`);
    console.log('WebSocket服务器已启动');
}); 